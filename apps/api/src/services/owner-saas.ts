/** Owner software plan (Hostels Pro) billing. See personas addendum §6. */
import { and, desc, eq, lt } from 'drizzle-orm';
import { addDays, istDate, monthOf, newId, OWNER_PLAN_PRICING, type OwnerPlan } from '@hostels/shared';
import { db, schema } from '../db';
import type { HostelRow } from './owner-access';

export const SAAS_GRACE_DAYS = 15;

type SaasRow = typeof schema.saasInvoices.$inferSelect;

async function openInvoiceFor(hostelId: string, periodMonth: string): Promise<SaasRow | undefined> {
  const [inv] = await db
    .select()
    .from(schema.saasInvoices)
    .where(and(eq(schema.saasInvoices.hostelId, hostelId), eq(schema.saasInvoices.periodMonth, periodMonth)))
    .orderBy(desc(schema.saasInvoices.createdAt));
  return inv && inv.status !== 'void' ? inv : undefined;
}

/**
 * Upgrade creates (or returns) this month's due invoice; the hostel turns Pro when it is paid.
 * Downgrade is immediate and voids unpaid invoices.
 */
export async function changePlan(hostel: HostelRow, plan: OwnerPlan, now = new Date()): Promise<{ hostel: HostelRow; invoice: SaasRow | null }> {
  if (plan === 'free') {
    const [h] = await db.update(schema.hostels).set({ ownerPlan: 'free' }).where(eq(schema.hostels.id, hostel.id)).returning();
    await db
      .update(schema.saasInvoices)
      .set({ status: 'void' })
      .where(and(eq(schema.saasInvoices.hostelId, hostel.id), eq(schema.saasInvoices.status, 'due')));
    return { hostel: h!, invoice: null };
  }
  const today = istDate(now);
  const month = monthOf(today);
  const existing = await openInvoiceFor(hostel.id, month);
  if (existing) {
    if (existing.status === 'paid' && hostel.ownerPlan !== 'pro') {
      // Paid this month already (e.g. downgraded then upgraded again): reinstate.
      const [h] = await db.update(schema.hostels).set({ ownerPlan: 'pro' }).where(eq(schema.hostels.id, hostel.id)).returning();
      return { hostel: h!, invoice: existing };
    }
    return { hostel, invoice: existing.status === 'due' ? existing : null };
  }
  const [inv] = await db
    .insert(schema.saasInvoices)
    .values({
      id: newId('sin'),
      hostelId: hostel.id,
      ownerId: hostel.ownerId,
      plan: 'pro',
      periodMonth: month,
      amount: OWNER_PLAN_PRICING.pro.price,
      dueDate: today,
    })
    .returning();
  return { hostel, invoice: inv! };
}

/** Monthly job: invoice every Pro hostel for the current month; downgrade after 15 days unpaid. */
export async function runSaasBilling(now = new Date()): Promise<number> {
  const today = istDate(now);
  const month = monthOf(today);
  let changed = 0;
  const pro = await db.select().from(schema.hostels).where(eq(schema.hostels.ownerPlan, 'pro'));
  for (const h of pro) {
    const inserted = await db
      .insert(schema.saasInvoices)
      .values({
        id: newId('sin'),
        hostelId: h.id,
        ownerId: h.ownerId,
        plan: 'pro',
        periodMonth: month,
        amount: OWNER_PLAN_PRICING.pro.price,
        dueDate: `${month}-01`,
      })
      .onConflictDoNothing()
      .returning({ id: schema.saasInvoices.id });
    changed += inserted.length;
  }
  const cutoff = addDays(today, -SAAS_GRACE_DAYS);
  const overdue = await db
    .select({ hostelId: schema.saasInvoices.hostelId })
    .from(schema.saasInvoices)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.saasInvoices.hostelId))
    .where(and(eq(schema.saasInvoices.status, 'due'), lt(schema.saasInvoices.dueDate, cutoff), eq(schema.hostels.ownerPlan, 'pro')));
  for (const { hostelId } of overdue) {
    await db.update(schema.hostels).set({ ownerPlan: 'free' }).where(eq(schema.hostels.id, hostelId));
    changed++;
  }
  return changed;
}
