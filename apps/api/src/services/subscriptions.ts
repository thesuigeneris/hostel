/** Subscribe, my stay, cancel. */
import { and, asc, desc, eq, gt, inArray, ne } from 'drizzle-orm';
import type { MyStay, SubscribeInput } from '@hostels/shared';
import { addDays, billingPeriod, istDate, newId, periodIndexFor } from '@hostels/shared';
import { db, schema, type DbOrTx } from '../db';
import { err } from '../lib/http';
import { isUniqueViolation } from './pg-errors';
import { toRoomType } from '../lib/serialize';
import { toInvoice, toMoveRequest, toSubscription } from '../lib/serialize-tenant';
import { createInvoiceForPeriod, regenerateUnpaidFrom } from './billing';
import { releaseBed, reserveBed } from './beds';
import { hostelSummaryById } from './hostel-read';
import { ensureOrder } from './payments';

type SubRow = typeof schema.subscriptions.$inferSelect;

export const MAX_START_DAYS_AHEAD = 30;

/** The tenant's current subscription: pending, active, or cancelling (still living there). */
export async function currentSubscription(userId: string, tx: DbOrTx = db): Promise<SubRow | null> {
  const [row] = await tx
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, userId), inArray(schema.subscriptions.status, ['pending', 'active', 'cancelled'])))
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function subscribe(userId: string, input: SubscribeInput & { mealPlan: SubRow['mealPlan']; diet: SubRow['diet'] }, now = new Date()) {
  const today = istDate(now);
  const startDate = input.startDate ?? today;
  if (startDate < today) throw err.validation('Start date cannot be in the past', [{ path: 'startDate', message: 'Pick today or later' }]);
  if (startDate > addDays(today, MAX_START_DAYS_AHEAD))
    throw err.validation(`Start within ${MAX_START_DAYS_AHEAD} days`, [{ path: 'startDate', message: `Pick a date within ${MAX_START_DAYS_AHEAD} days` }]);

  const result = await db
    .transaction(async (tx) => {
      const [hostel] = await tx.select().from(schema.hostels).where(eq(schema.hostels.id, input.hostelId));
      if (!hostel || hostel.status !== 'live') throw err.notFound('Hostel');
      if (hostel.partnerStatus !== 'verified') throw err.domain('not_verified', 'Only verified partner hostels take subscriptions');
      const [room] = await tx
        .select()
        .from(schema.roomTypes)
        .where(and(eq(schema.roomTypes.id, input.roomTypeId), eq(schema.roomTypes.hostelId, hostel.id)));
      if (!room) throw err.notFound('Room type');

      const [open] = await tx
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(and(eq(schema.subscriptions.userId, userId), inArray(schema.subscriptions.status, ['pending', 'active', 'cancelled'])))
        .limit(1);
      if (open) throw err.conflict('already_subscribed', 'You already have a plan. Cancel or move instead.');

      await reserveBed(tx, room.id);
      const [sub] = await tx
        .insert(schema.subscriptions)
        .values({
          id: newId('sub'),
          userId,
          hostelId: hostel.id,
          roomTypeId: room.id,
          mealPlan: input.mealPlan,
          diet: input.diet,
          status: 'pending',
          startDate,
        })
        .returning();
      const invoice = await createInvoiceForPeriod(sub!, 0, tx);
      return { sub: sub!, invoice: invoice! };
    })
    .catch((e) => {
      // Partial unique index: a concurrent subscribe by the same user won the race.
      if (isUniqueViolation(e)) throw err.conflict('already_subscribed', 'You already have a plan');
      throw e;
    });

  const invoice = await ensureOrder(result.invoice);
  return { subscription: toSubscription(result.sub), invoice: toInvoice(invoice, today) };
}

export async function myStay(userId: string, now = new Date()): Promise<MyStay> {
  const today = istDate(now);
  const sub = await currentSubscription(userId);
  if (!sub) return { subscription: null, hostel: null, roomType: null, upcomingMove: null, currentInvoice: null };
  const [[room], [move], invoices, hostel] = await Promise.all([
    db.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, sub.roomTypeId)),
    db
      .select()
      .from(schema.moveRequests)
      .where(and(eq(schema.moveRequests.subscriptionId, sub.id), eq(schema.moveRequests.status, 'scheduled')))
      .limit(1),
    db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.subscriptionId, sub.id), ne(schema.invoices.status, 'void')))
      .orderBy(asc(schema.invoices.periodStart)),
    hostelSummaryById(sub.hostelId),
  ]);
  // The bill to act on: the oldest unpaid one, else the one covering today, else the latest.
  const current =
    invoices.find((i) => i.status === 'due') ??
    invoices.find((i) => i.periodStart <= today && today <= i.periodEnd) ??
    invoices[invoices.length - 1] ??
    null;
  return {
    subscription: toSubscription(sub),
    hostel,
    roomType: room ? toRoomType(room) : null,
    upcomingMove: move ? toMoveRequest(move) : null,
    currentInvoice: current ? toInvoice(current, today) : null,
  };
}

/**
 * Cancel at the end of the current paid period. A still-pending plan is dropped immediately
 * and its bed released.
 */
export async function cancelSubscription(userId: string, now = new Date()) {
  const today = istDate(now);
  return db.transaction(async (tx) => {
    const sub = await currentSubscription(userId, tx);
    if (!sub) throw err.notFound('Subscription');
    if (sub.status === 'cancelled') throw err.conflict('conflict', 'This plan is already set to end');

    if (sub.status === 'pending') {
      const [ended] = await tx
        .update(schema.subscriptions)
        .set({ status: 'ended', cancelAt: today })
        .where(and(eq(schema.subscriptions.id, sub.id), eq(schema.subscriptions.status, 'pending')))
        .returning();
      if (!ended) throw err.conflict('conflict', 'This plan changed. Refresh and try again.');
      await releaseBed(tx, sub.roomTypeId);
      await tx
        .update(schema.invoices)
        .set({ status: 'void' })
        .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.status, 'due')));
      return toSubscription(ended);
    }

    // End of the current paid period: the latest paid bill's end, and at least the period covering today.
    const [lastPaid] = await tx
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.status, 'paid')))
      .orderBy(desc(schema.invoices.periodStart))
      .limit(1);
    const todayPeriodEnd = billingPeriod(sub.startDate, Math.max(0, periodIndexFor(sub.startDate, today))).periodEnd;
    const cancelAt = lastPaid && lastPaid.periodEnd > todayPeriodEnd ? lastPaid.periodEnd : todayPeriodEnd;

    const [updated] = await tx
      .update(schema.subscriptions)
      .set({ status: 'cancelled', cancelAt })
      .where(and(eq(schema.subscriptions.id, sub.id), eq(schema.subscriptions.status, 'active')))
      .returning();
    if (!updated) throw err.conflict('conflict', 'This plan changed. Refresh and try again.');

    // No further bills after the plan ends.
    await tx
      .update(schema.invoices)
      .set({ status: 'void' })
      .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.status, 'due'), gt(schema.invoices.periodStart, cancelAt)));

    // A scheduled move no longer makes sense; give the destination bed back.
    const cancelledMoves = await tx
      .update(schema.moveRequests)
      .set({ status: 'cancelled' })
      .where(and(eq(schema.moveRequests.subscriptionId, sub.id), eq(schema.moveRequests.status, 'scheduled')))
      .returning();
    for (const m of cancelledMoves) {
      await releaseBed(tx, m.toRoomTypeId);
      await regenerateUnpaidFrom(updated, m.moveDate, tx);
    }

    return toSubscription(updated);
  });
}
