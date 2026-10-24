import type { OwnerPlanTier, User } from '@hostels/shared';
import {
  addDays,
  addMonths,
  billingPeriod,
  daysBetween,
  invoiceGenerationDate,
  isOverdue,
  newId,
  OWNER_DOWNGRADE_DAYS,
  OWNER_PLANS,
  OWNER_TRIAL_MONTHS,
  periodContaining,
} from '@hostels/shared';
import { and, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';
import { clock } from '../lib/clock';
import { AppError } from '../lib/errors';
import { ownedHostel } from './access';
import { applyForPartner } from './listings';

const RANK: Record<OwnerPlanTier, number> = { free: 0, pro: 1, partner: 2 };

/** Starts a plan today, re-anchoring its billing. The first paid plan on a hostel gets a free first month. */
export async function switchPlan(tx: Tx, hostelId: string, plan: OwnerPlanTier) {
  const today = clock.today();
  const [current] = await tx.select().from(schema.ownerPlans).where(eq(schema.ownerPlans.hostelId, hostelId));
  const trialEndsOn =
    current?.trialEndsOn ?? (plan === 'free' ? null : addMonths(today, OWNER_TRIAL_MONTHS));
  if (current) {
    // Only bills for periods the old plan hasn't started are dropped; months already used stay owed,
    // and refreshSuspensions keeps deciding whether the hostel is paused.
    await tx
      .update(schema.ownerInvoices)
      .set({ status: 'void' })
      .where(
        and(
          eq(schema.ownerInvoices.ownerPlanId, current.id),
          eq(schema.ownerInvoices.status, 'due'),
          gte(schema.ownerInvoices.periodStart, today),
        ),
      );
    await tx
      .update(schema.ownerPlans)
      .set({ plan, startDate: today, trialEndsOn, pendingPlan: null, pendingPlanOn: null })
      .where(eq(schema.ownerPlans.id, current.id));
  } else {
    await tx.insert(schema.ownerPlans).values({ id: newId('opl'), hostelId, plan, startDate: today, trialEndsOn });
  }
}

export async function getPlan(user: User, hostelId: string) {
  const h = await ownedHostel(user, hostelId);
  const db = getDb();
  const [plan] = await db.select().from(schema.ownerPlans).where(eq(schema.ownerPlans.hostelId, h.id));
  const bills = await db
    .select()
    .from(schema.ownerInvoices)
    .where(eq(schema.ownerInvoices.hostelId, h.id))
    .orderBy(desc(schema.ownerInvoices.periodStart));
  const today = clock.today();
  const inTrial = !!plan?.trialEndsOn && today < plan.trialEndsOn;
  return {
    plan: plan ?? null,
    price: OWNER_PLANS[plan?.plan ?? 'free'].price,
    inTrial,
    partnerStatus: h.partnerStatus,
    bills: bills.map(toOwnerInvoice),
  };
}

export function toOwnerInvoice(r: typeof schema.ownerInvoices.$inferSelect) {
  return {
    ...r,
    paidAt: r.paidAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    isOverdue: isOverdue(r, clock.now()),
  };
}

export async function changePlan(user: User, hostelId: string, target: OwnerPlanTier) {
  const h = await ownedHostel(user, hostelId);
  const db = getDb();
  const [plan] = await db.select().from(schema.ownerPlans).where(eq(schema.ownerPlans.hostelId, h.id));
  const current = plan?.plan ?? 'free';
  if (target === current && !plan?.pendingPlan) throw new AppError('invalid_state', `This hostel is already on ${OWNER_PLANS[target].label}`);
  if (target === current) {
    // Choosing the current plan again cancels a scheduled change.
    await db.update(schema.ownerPlans).set({ pendingPlan: null, pendingPlanOn: null }).where(eq(schema.ownerPlans.hostelId, h.id));
    return getPlan(user, hostelId);
  }

  if (target === 'partner') {
    await applyForPartner(user, hostelId);
    return getPlan(user, hostelId);
  }

  if (RANK[target] > RANK[current]) {
    await db.transaction((tx) => switchPlan(tx, h.id, target));
    return getPlan(user, hostelId);
  }

  // Downgrade.
  if (current === 'partner') {
    const [open] = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(and(eq(schema.subscriptions.hostelId, h.id), inArray(schema.subscriptions.status, ['pending', 'active'])))
      .limit(1);
    if (open) throw new AppError('invalid_state', 'Partner hostels with active subscribers cannot leave the Partner plan yet');
  }
  const today = clock.today();
  const inTrial = !!plan?.trialEndsOn && today < plan.trialEndsOn;
  if (!plan || inTrial) {
    await db.transaction(async (tx) => {
      await switchPlan(tx, h.id, target);
      if (current === 'partner') await tx.update(schema.hostels).set({ partnerStatus: 'none' }).where(eq(schema.hostels.id, h.id));
    });
  } else {
    const effectiveOn = addDays(periodContaining(plan.startDate, today).end, 1);
    await db.update(schema.ownerPlans).set({ pendingPlan: target, pendingPlanOn: effectiveOn }).where(eq(schema.ownerPlans.id, plan.id));
  }
  return getPlan(user, hostelId);
}

/** Applies downgrades whose date has come. */
export async function applyPendingPlanChanges(today = clock.today()) {
  const db = getDb();
  const due = await db.select().from(schema.ownerPlans).where(lte(schema.ownerPlans.pendingPlanOn, today));
  let applied = 0;
  for (const p of due) {
    if (!p.pendingPlan) continue;
    await db.transaction(async (tx) => {
      const from = p.plan;
      await switchPlan(tx, p.hostelId, p.pendingPlan!);
      if (from === 'partner') await tx.update(schema.hostels).set({ partnerStatus: 'none' }).where(eq(schema.hostels.id, p.hostelId));
    });
    applied++;
  }
  return applied;
}

/** Bills each paid plan per period on the same 5-day lead as tenant bills; trial periods are free. */
export async function generateOwnerInvoices(today = clock.today()) {
  const db = getDb();
  const plans = await db
    .select({ plan: schema.ownerPlans, ownerId: schema.hostels.ownerId })
    .from(schema.ownerPlans)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.ownerPlans.hostelId))
    .where(ne(schema.ownerPlans.plan, 'free'));
  let created = 0;
  for (const { plan, ownerId } of plans) {
    if (plan.startDate > addDays(today, 5)) continue;
    const last = periodContaining(plan.startDate, today).index + 1;
    for (let n = 0; n <= last; n++) {
      const p = billingPeriod(plan.startDate, n);
      if (invoiceGenerationDate(p.start) > today && p.start > today) continue;
      if (plan.trialEndsOn && p.start < plan.trialEndsOn) continue;
      if (plan.pendingPlanOn && p.start >= plan.pendingPlanOn) continue;
      const rows = await db
        .insert(schema.ownerInvoices)
        .values({
          id: newId('oin'),
          ownerPlanId: plan.id,
          hostelId: plan.hostelId,
          ownerId,
          plan: plan.plan,
          periodStart: p.start,
          periodEnd: p.end,
          amount: OWNER_PLANS[plan.plan].price,
          dueDate: p.start,
        })
        .onConflictDoNothing()
        .returning({ id: schema.ownerInvoices.id });
      created += rows.length;
    }
  }
  return created;
}

/** Owner bills more than 15 days past due pause the hostel's paid features; paying restores them. */
export async function refreshSuspensions(today = clock.today()) {
  const db = getDb();
  const plans = await db.select().from(schema.ownerPlans);
  const due = await db.select().from(schema.ownerInvoices).where(eq(schema.ownerInvoices.status, 'due'));
  let changed = 0;
  for (const p of plans) {
    const suspended = due.some((b) => b.ownerPlanId === p.id && daysBetween(b.dueDate, today) > OWNER_DOWNGRADE_DAYS);
    if (suspended !== p.suspended) {
      await db.update(schema.ownerPlans).set({ suspended }).where(eq(schema.ownerPlans.id, p.id));
      changed++;
    }
  }
  return changed;
}
