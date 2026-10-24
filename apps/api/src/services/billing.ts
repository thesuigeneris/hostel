/**
 * Subscription billing (base spec §4).
 *
 * Period n runs start+n months .. day before start+(n+1) months. The bill for period k ≥ 1 is
 * generated BILL_LEAD_DAYS before it starts and is due on its first day. It carries credits for
 * skips dated from the previous bill's generation day (or the start date, for k = 1) up to the day
 * before its own generation day, capped at that period's food price. Period 0 is billed at
 * subscribe time with no credits.
 */
import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { addDays, billAmounts, billingPeriod, invoiceGenerationDate, istDate, newId, periodIndexFor } from '@hostels/shared';
import { db, schema, type DbOrTx } from '../db';

type SubRow = typeof schema.subscriptions.$inferSelect;
type InvoiceRow = typeof schema.invoices.$inferSelect;

/** Inclusive date window of skips whose credit lands on the bill for period k. Empty for k = 0. */
export function creditWindow(startDate: string, k: number): { from: string; to: string } | null {
  if (k <= 0) return null;
  const from = k === 1 ? startDate : invoiceGenerationDate(billingPeriod(startDate, k - 1).periodStart);
  const to = addDays(invoiceGenerationDate(billingPeriod(startDate, k).periodStart), -1);
  return { from, to };
}

export async function skipCreditsBetween(subscriptionId: string, from: string, to: string, tx: DbOrTx = db): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${schema.mealSkips.creditAmount}), 0)`.mapWith(Number) })
    .from(schema.mealSkips)
    .where(and(eq(schema.mealSkips.subscriptionId, subscriptionId), gte(schema.mealSkips.date, from), lte(schema.mealSkips.date, to)));
  return row?.total ?? 0;
}

/** The hostel + room the tenant will be in on `date`, counting a scheduled move. */
export async function placementOn(sub: SubRow, date: string, tx: DbOrTx = db): Promise<{ hostelId: string; roomTypeId: string }> {
  const [move] = await tx
    .select()
    .from(schema.moveRequests)
    .where(and(eq(schema.moveRequests.subscriptionId, sub.id), eq(schema.moveRequests.status, 'scheduled'), lte(schema.moveRequests.moveDate, date)))
    .limit(1);
  return move ? { hostelId: move.toHostelId, roomTypeId: move.toRoomTypeId } : { hostelId: sub.hostelId, roomTypeId: sub.roomTypeId };
}

/** Insert the bill for period k. Returns null if a live (non-void) bill already exists for it. */
export async function createInvoiceForPeriod(sub: SubRow, k: number, tx: DbOrTx = db): Promise<InvoiceRow | null> {
  const { periodStart, periodEnd } = billingPeriod(sub.startDate, k);
  const place = await placementOn(sub, periodStart, tx);
  const [room] = await tx.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, place.roomTypeId));
  if (!room) throw new Error(`room type ${place.roomTypeId} missing`);
  const window = creditWindow(sub.startDate, k);
  const skipCredits = window ? await skipCreditsBetween(sub.id, window.from, window.to, tx) : 0;
  const amounts = billAmounts({ rent: room.monthlyRent, plan: sub.mealPlan, skipCredits });
  const [row] = await tx
    .insert(schema.invoices)
    .values({
      id: newId('inv'),
      subscriptionId: sub.id,
      userId: sub.userId,
      hostelId: place.hostelId,
      roomTypeId: place.roomTypeId,
      periodStart,
      periodEnd,
      ...amounts,
      status: 'due',
      dueDate: periodStart,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** Latest non-void invoice for a subscription. */
export async function latestInvoice(subscriptionId: string, tx: DbOrTx = db): Promise<InvoiceRow | null> {
  const [row] = await tx
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.subscriptionId, subscriptionId), ne(schema.invoices.status, 'void')))
    .orderBy(desc(schema.invoices.periodStart))
    .limit(1);
  return row ?? null;
}

/**
 * Generate every bill whose generation day has arrived for one subscription.
 * Stops at the cancellation date. Returns how many were created.
 */
export async function generateDueInvoicesFor(sub: SubRow, today: string, tx: DbOrTx = db): Promise<number> {
  if (sub.status !== 'active' && sub.status !== 'cancelled') return 0;
  let created = 0;
  const last = await latestInvoice(sub.id, tx);
  let k = last ? periodIndexFor(sub.startDate, last.periodStart) + 1 : 0;
  for (;;) {
    const { periodStart } = billingPeriod(sub.startDate, k);
    if (sub.cancelAt && periodStart > sub.cancelAt) break;
    if (k > 0 && today < invoiceGenerationDate(periodStart)) break;
    if (await createInvoiceForPeriod(sub, k, tx)) created++;
    k++;
  }
  return created;
}

/**
 * Void unpaid bills for periods starting on/after `fromDate` and regenerate them,
 * e.g. after a move is scheduled or cancelled so rent and hostel follow the new room.
 */
export async function regenerateUnpaidFrom(sub: SubRow, fromDate: string, tx: DbOrTx = db): Promise<number> {
  const stale = await tx
    .update(schema.invoices)
    .set({ status: 'void' })
    .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.status, 'due'), gte(schema.invoices.periodStart, fromDate)))
    .returning();
  for (const inv of stale.sort((a, b) => a.periodStart.localeCompare(b.periodStart))) {
    await createInvoiceForPeriod(sub, periodIndexFor(sub.startDate, inv.periodStart), tx);
  }
  return stale.length;
}

/** All of a user's non-void invoices, newest period first. */
export async function invoicesForUser(userId: string): Promise<InvoiceRow[]> {
  return db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.userId, userId), ne(schema.invoices.status, 'void')))
    .orderBy(desc(schema.invoices.periodStart), asc(schema.invoices.id));
}

export const todayIst = (now: Date = new Date()) => istDate(now);
