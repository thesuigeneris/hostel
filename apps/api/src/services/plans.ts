import type { AdminOwnerInvoice, AdminOwnerPlan, InvoiceStatus, OwnerPlanTier, PaymentMode, User } from '@hostels/shared';
import {
  addDays,
  addMonths,
  billingPeriod,
  creditNote,
  daysBetween,
  invoiceGenerationDate,
  isOverdue,
  newId,
  OWNER_DOWNGRADE_DAYS,
  OWNER_PLANS,
  OWNER_TRIAL_MONTHS,
  periodContaining,
  prorate,
  splitPeriod,
  usedDaysNote,
} from '@hostels/shared';
import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';
import { clock } from '../lib/clock';
import { AppError, notFound } from '../lib/errors';
import { ownedHostel } from './access';
import { applyForPartner } from './listings';

const RANK: Record<OwnerPlanTier, number> = { free: 0, pro: 1, partner: 2 };

/**
 * Starts a plan today, re-anchoring its billing. The first paid plan on a hostel gets a free first month, once: inside
 * that month a paid plan's billing starts when the month ends, so switching down and up again never adds free days.
 *
 * Money already paid or owed for the old plan's current month is settled here, so an upgrade never charges twice:
 * - a paid bill's unused days (from today) are credited on the new plan's first bill, never more than that bill;
 * - an unpaid bill is cut to the days used before today (same due date, so an overdue pause stands), or dropped
 *   when no day was used; bills for months not yet started are dropped.
 * Only money actually paid is credited: a waived or unpaid bill earns nothing, and a bill that itself carried a
 * credit passes on only what was paid for it.
 */
export async function switchPlan(tx: Tx, hostelId: string, plan: OwnerPlanTier) {
  const today = clock.today();
  const [current] = await tx.select().from(schema.ownerPlans).where(eq(schema.ownerPlans.hostelId, hostelId)).for('update');
  const trialEndsOn = current?.trialEndsOn ?? (plan === 'free' ? null : addMonths(today, OWNER_TRIAL_MONTHS));
  const startDate = plan !== 'free' && current?.trialEndsOn && today < current.trialEndsOn ? current.trialEndsOn : today;
  let planId = current?.id;
  let credit = 0;
  let creditFrom: { plan: OwnerPlanTier; to: string } | null = null;
  if (current) {
    const oi = schema.ownerInvoices;
    const open = await tx
      .select()
      .from(oi)
      .where(and(eq(oi.ownerPlanId, current.id), inArray(oi.status, ['due', 'paid']), gte(oi.periodEnd, today)))
      .for('update');
    for (const b of open) {
      const { periodDays, usedDays, unusedDays } = splitPeriod(b.periodStart, b.periodEnd, today);
      if (b.status === 'paid') {
        credit += prorate(b.amount, unusedDays, periodDays);
        if (!creditFrom || b.periodEnd > creditFrom.to) creditFrom = { plan: b.plan, to: b.periodEnd };
        continue;
      }
      // Due: drop it, and bill the days already used, if any.
      await tx.update(oi).set({ status: 'void' }).where(and(eq(oi.id, b.id), eq(oi.status, 'due')));
      if (usedDays > 0) {
        await tx.insert(oi).values({
          id: newId('oin'),
          ownerPlanId: b.ownerPlanId,
          hostelId: b.hostelId,
          ownerId: b.ownerId,
          plan: b.plan,
          periodStart: b.periodStart,
          periodEnd: addDays(today, -1),
          amount: prorate(b.amount, usedDays, periodDays),
          note: usedDaysNote(b.plan, b.periodStart, addDays(today, -1)),
          dueDate: b.dueDate,
        });
      }
    }
    await tx
      .update(schema.ownerPlans)
      .set({ plan, startDate, trialEndsOn, pendingPlan: null, pendingPlanOn: null })
      .where(eq(schema.ownerPlans.id, current.id));
  } else {
    planId = newId('opl');
    await tx.insert(schema.ownerPlans).values({ id: planId, hostelId, plan, startDate, trialEndsOn });
  }
  // A paid plan outside the free month bills its first month now, with the credit on it. Later months come from
  // `generateOwnerInvoices`, which skips this one (same plan and period).
  if (plan === 'free' || startDate !== today || (trialEndsOn && today < trialEndsOn)) return;
  const [h] = await tx.select({ ownerId: schema.hostels.ownerId }).from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  const first = billingPeriod(startDate, 0);
  const price = OWNER_PLANS[plan].price;
  const creditAmount = Math.min(credit, price);
  await tx
    .insert(schema.ownerInvoices)
    .values({
      id: newId('oin'),
      ownerPlanId: planId!,
      hostelId,
      ownerId: h!.ownerId,
      plan,
      periodStart: first.start,
      periodEnd: first.end,
      amount: price - creditAmount,
      creditAmount,
      note: creditAmount && creditFrom ? creditNote(creditFrom.plan, today, creditFrom.to) : null,
      dueDate: first.start,
    })
    .onConflictDoNothing();
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
  // A Free hostel isn't "in a trial" even when its one free month hasn't run out.
  const inTrial = !!plan?.trialEndsOn && plan.plan !== 'free' && today < plan.trialEndsOn;
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
    // At the end of the month paid for: this one, or the next one when its bill is already paid. An unpaid bill for
    // the next month is dropped now, since the plan changes before that month starts (it comes back if the change
    // is called off).
    let effectiveOn = addDays(periodContaining(plan.startDate, today).end, 1);
    const oi = schema.ownerInvoices;
    const next = await db
      .select()
      .from(oi)
      .where(and(eq(oi.ownerPlanId, plan.id), eq(oi.periodStart, effectiveOn), inArray(oi.status, ['due', 'paid'])));
    for (const b of next) {
      if (b.status === 'paid') effectiveOn = addDays(b.periodEnd, 1);
      else await db.update(oi).set({ status: 'void' }).where(and(eq(oi.id, b.id), eq(oi.status, 'due')));
    }
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

// --- admin oversight ---------------------------------------------------------

const ownerSearch = (q?: string) =>
  q ? or(ilike(schema.hostels.name, `%${q}%`), ilike(schema.hostels.area, `%${q}%`), ilike(schema.users.name, `%${q}%`), ilike(schema.users.phone, `%${q}%`)) : undefined;

/** Every hostel's plan with what it owes, for the admin billing page. */
export async function adminOwnerPlans(filter: { plan?: OwnerPlanTier; suspended?: boolean; q?: string } = {}): Promise<AdminOwnerPlan[]> {
  const db = getDb();
  const rows = await db
    .select({ plan: schema.ownerPlans, hostel: schema.hostels, owner: schema.users })
    .from(schema.ownerPlans)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.ownerPlans.hostelId))
    .innerJoin(schema.users, eq(schema.users.id, schema.hostels.ownerId))
    .where(
      and(
        filter.plan ? eq(schema.ownerPlans.plan, filter.plan) : undefined,
        filter.suspended !== undefined ? eq(schema.ownerPlans.suspended, filter.suspended) : undefined,
        ownerSearch(filter.q),
      ),
    )
    .orderBy(desc(schema.ownerPlans.suspended), asc(schema.hostels.name));
  const due = await db.select().from(schema.ownerInvoices).where(eq(schema.ownerInvoices.status, 'due'));
  const today = clock.today();
  const now = clock.now();
  return rows.map(({ plan, hostel, owner }) => {
    const bills = due.filter((b) => b.ownerPlanId === plan.id);
    return {
      id: plan.id,
      hostelId: hostel.id,
      hostelName: hostel.name,
      area: hostel.area,
      owner: { id: owner.id, name: owner.name, phone: owner.phone },
      plan: plan.plan,
      pendingPlan: plan.pendingPlan,
      pendingPlanOn: plan.pendingPlanOn,
      startDate: plan.startDate,
      trialEndsOn: plan.trialEndsOn,
      inTrial: !!plan.trialEndsOn && plan.plan !== 'free' && today < plan.trialEndsOn,
      suspended: plan.suspended,
      partnerStatus: hostel.partnerStatus,
      amountDue: bills.reduce((n, b) => n + b.amount, 0),
      overdueBills: bills.filter((b) => isOverdue(b, now)).length,
    };
  });
}

export async function adminOwnerInvoices(
  filter: { status?: InvoiceStatus; mode?: PaymentMode; overdue?: boolean; q?: string } = {},
): Promise<AdminOwnerInvoice[]> {
  const rows = await getDb()
    .select({ invoice: schema.ownerInvoices, hostelName: schema.hostels.name, ownerName: schema.users.name, ownerPhone: schema.users.phone })
    .from(schema.ownerInvoices)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.ownerInvoices.hostelId))
    .innerJoin(schema.users, eq(schema.users.id, schema.ownerInvoices.ownerId))
    .where(
      and(
        filter.overdue ? eq(schema.ownerInvoices.status, 'due') : filter.status ? eq(schema.ownerInvoices.status, filter.status) : undefined,
        filter.mode ? eq(schema.ownerInvoices.paymentMode, filter.mode) : undefined,
        ownerSearch(filter.q),
      ),
    )
    .orderBy(desc(schema.ownerInvoices.periodStart));
  const list = rows.map((r) => ({ ...toOwnerInvoice(r.invoice), hostelName: r.hostelName, ownerName: r.ownerName, ownerPhone: r.ownerPhone }));
  return filter.overdue ? list.filter((b) => b.isOverdue) : list;
}

/** Waives an unpaid owner bill (a dispute, or a goodwill month). Lifts a pause it caused. */
export async function voidOwnerInvoice(id: string) {
  const db = getDb();
  const [row] = await db.select().from(schema.ownerInvoices).where(eq(schema.ownerInvoices.id, id));
  if (!row) throw notFound('Bill');
  if (row.status !== 'due') throw new AppError('invalid_state', row.status === 'paid' ? 'This bill is already paid' : 'This bill is already void');
  // Marked `waived`, unlike bills a plan change drops, so it is never mistaken for revenue or for a system cancellation.
  const [updated] = await db
    .update(schema.ownerInvoices)
    .set({ status: 'void', paymentMode: 'waived' })
    .where(and(eq(schema.ownerInvoices.id, id), eq(schema.ownerInvoices.status, 'due')))
    .returning();
  if (!updated) throw new AppError('invalid_state', 'This bill changed while you were looking; refresh and try again');
  await refreshSuspensions();
  return toOwnerInvoice(updated);
}
