/**
 * Background jobs for subscriptions. Each is idempotent: status guards on every update mean a
 * second run (or a concurrent one) changes nothing.
 */
import { and, eq, inArray, lt, lte } from 'drizzle-orm';
import { istDate } from '@hostels/shared';
import { db, schema } from '../db';
import { generateDueInvoicesFor } from './billing';
import { releaseBed } from './beds';
import { jobs } from './jobs';
import { endSubscriptionResidency, startSubscriptionResidency } from './residency';

export const PENDING_TTL_MS = 30 * 60 * 1000;

/** Unpaid pending subscriptions older than 30 minutes expire and release their bed. */
export async function expirePendingSubscriptions(now = new Date()): Promise<number> {
  const stale = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.status, 'pending'), lt(schema.subscriptions.createdAt, new Date(now.getTime() - PENDING_TTL_MS))));
  let n = 0;
  for (const { id } of stale) {
    const done = await db.transaction(async (tx) => {
      const [sub] = await tx
        .update(schema.subscriptions)
        .set({ status: 'expired' })
        .where(and(eq(schema.subscriptions.id, id), eq(schema.subscriptions.status, 'pending')))
        .returning();
      if (!sub) return false;
      await releaseBed(tx, sub.roomTypeId);
      await tx
        .update(schema.invoices)
        .set({ status: 'void' })
        .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.status, 'due')));
      return true;
    });
    if (done) n++;
  }
  return n;
}

/** Create bills whose generation day (5 days before the period) has arrived. */
export async function generateUpcomingInvoices(now = new Date()): Promise<number> {
  const today = istDate(now);
  const subs = await db.select().from(schema.subscriptions).where(inArray(schema.subscriptions.status, ['active', 'cancelled']));
  let n = 0;
  for (const sub of subs) n += await generateDueInvoicesFor(sub, today);
  return n;
}

/** On the move date: switch the subscription, release the old bed, move the residency. */
export async function completeDueMoves(now = new Date()): Promise<number> {
  const today = istDate(now);
  const due = await db
    .select({ id: schema.moveRequests.id })
    .from(schema.moveRequests)
    .where(and(eq(schema.moveRequests.status, 'scheduled'), lte(schema.moveRequests.moveDate, today)));
  let n = 0;
  for (const { id } of due) {
    const done = await db.transaction(async (tx) => {
      const [move] = await tx
        .update(schema.moveRequests)
        .set({ status: 'completed' })
        .where(and(eq(schema.moveRequests.id, id), eq(schema.moveRequests.status, 'scheduled')))
        .returning();
      if (!move) return false;
      const [sub] = await tx
        .update(schema.subscriptions)
        .set({ hostelId: move.toHostelId, roomTypeId: move.toRoomTypeId })
        .where(eq(schema.subscriptions.id, move.subscriptionId))
        .returning();
      const [room] = await tx.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, move.toRoomTypeId));
      await releaseBed(tx, move.fromRoomTypeId);
      await endSubscriptionResidency(tx, { subscriptionId: sub!.id, hostelId: move.fromHostelId, endDate: move.moveDate });
      await startSubscriptionResidency(tx, {
        userId: sub!.userId,
        hostelId: move.toHostelId,
        subscriptionId: sub!.id,
        startDate: move.moveDate,
        monthlyRent: room!.monthlyRent,
      });
      return true;
    });
    if (done) n++;
  }
  return n;
}

/** The day after `cancelAt`, a cancelled subscription ends and its bed is released. */
export async function endCancelledSubscriptions(now = new Date()): Promise<number> {
  const today = istDate(now);
  const due = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.status, 'cancelled'), lt(schema.subscriptions.cancelAt, today)));
  let n = 0;
  for (const { id } of due) {
    const done = await db.transaction(async (tx) => {
      const [sub] = await tx
        .update(schema.subscriptions)
        .set({ status: 'ended' })
        .where(and(eq(schema.subscriptions.id, id), eq(schema.subscriptions.status, 'cancelled')))
        .returning();
      if (!sub) return false;
      await releaseBed(tx, sub.roomTypeId);
      await endSubscriptionResidency(tx, { subscriptionId: sub.id, hostelId: sub.hostelId, endDate: sub.cancelAt! });
      const moves = await tx
        .update(schema.moveRequests)
        .set({ status: 'cancelled' })
        .where(and(eq(schema.moveRequests.subscriptionId, sub.id), eq(schema.moveRequests.status, 'scheduled')))
        .returning();
      for (const m of moves) await releaseBed(tx, m.toRoomTypeId);
      return true;
    });
    if (done) n++;
  }
  return n;
}

// Order matters: finish moves before billing so new bills use the new room.
jobs.push(
  { name: 'expire-pending-subscriptions', run: expirePendingSubscriptions },
  { name: 'complete-due-moves', run: completeDueMoves },
  { name: 'end-cancelled-subscriptions', run: endCancelledSubscriptions },
  { name: 'generate-upcoming-invoices', run: generateUpcomingInvoices },
);
