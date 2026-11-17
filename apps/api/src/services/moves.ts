import type { User } from '@hostels/shared';
import { addDays, dateLabel, newId } from '@hostels/shared';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';
import { clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError, notFound } from '../lib/errors';
import type { ReceivedMode } from '../lib/razorpay';
import { isBookable, type PlanState, planFor } from './access';
import { openSubscription, regenerateUnpaidFrom, releaseBed, reserveBed } from './billing';
import { scheduledFoodChange } from './food-plan-state';
import { recordPaymentException } from './refunds';

type MoveRow = typeof schema.moveRequests.$inferSelect;

/**
 * A move was cancelled after bills for periods from the move date on were already paid at the new room's rent. Those
 * bills go back to the hostel the payer stays in (so its payout counts them), with the rent cut to the room they are
 * actually in, and any rent paid above that is owed back as a `move_cancelled` refund. A room that costs more than
 * the one they paid for is never charged extra: the bill keeps what was paid. Runs in the cancelling transaction,
 * which only one caller can win, so it happens once per move.
 */
async function settlePaidBillsOfCancelledMove(tx: Tx, move: MoveRow) {
  const paid = await tx
    .select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.subscriptionId, move.subscriptionId),
        eq(schema.invoices.status, 'paid'),
        eq(schema.invoices.hostelId, move.toHostelId),
        gte(schema.invoices.periodStart, move.moveDate),
      ),
    )
    .for('update');
  if (!paid.length) return;
  const [room] = await tx.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, move.fromRoomTypeId));
  if (!room) throw new Error(`room ${move.fromRoomTypeId} missing`);
  for (const bill of paid) {
    const over = Math.max(0, bill.rentAmount - room.monthlyRent);
    const [row] = await tx
      .update(schema.invoices)
      .set({ hostelId: move.fromHostelId, rentAmount: bill.rentAmount - over, totalAmount: bill.totalAmount - over })
      .where(and(eq(schema.invoices.id, bill.id), eq(schema.invoices.hostelId, move.toHostelId)))
      .returning();
    // Waived bills took no money, so there is nothing to give back.
    if (!row || over === 0 || row.paymentMode === 'waived' || !row.razorpayOrderId || !row.razorpayPaymentId) continue;
    await recordPaymentException(
      tx,
      { kind: 'tenant', row },
      { orderId: row.razorpayOrderId, paymentId: row.razorpayPaymentId, mode: row.paymentMode as ReceivedMode },
      'move_cancelled',
      over,
    );
  }
}

function toMove(m: typeof schema.moveRequests.$inferSelect) {
  return { ...m, createdAt: m.createdAt.toISOString() };
}

/** Reserves a bed at the destination now; the move itself happens on the move date. */
export async function scheduleMove(user: User, input: { toRoomTypeId: string; moveDate: string }) {
  const db = getDb();
  const tomorrow = addDays(clock.today(), 1);
  if (input.moveDate < tomorrow) throw new AppError('move_not_allowed', 'Pick a move date from tomorrow on');
  try {
    return await db.transaction(async (tx) => {
      const sub = await openSubscription(user.id, tx);
      if (!sub || sub.status !== 'active') throw new AppError('move_not_allowed', 'You need an active plan to move');
      if (sub.cancelAt && input.moveDate > sub.cancelAt) throw new AppError('move_not_allowed', 'Your plan ends before that date');
      if (input.toRoomTypeId === sub.roomTypeId) throw new AppError('move_not_allowed', 'You are already in this room type');
      // A month already paid for this room, starting on or after the move date, would stay with this hostel at this
      // rent while they live elsewhere. Until moving a paid month is supported, the move waits for it to end.
      const [paidAhead] = await tx
        .select({ periodStart: schema.invoices.periodStart, periodEnd: schema.invoices.periodEnd })
        .from(schema.invoices)
        .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.status, 'paid'), gte(schema.invoices.periodStart, input.moveDate)))
        .orderBy(desc(schema.invoices.periodEnd))
        .limit(1);
      if (paidAhead) {
        throw new AppError(
          'move_not_allowed',
          `You've already paid for ${dateLabel(paidAhead.periodStart)} to ${dateLabel(paidAhead.periodEnd)} here. Pick a move date after ${dateLabel(paidAhead.periodEnd)}.`,
        );
      }
      const [room] = await tx.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, input.toRoomTypeId));
      if (!room) throw notFound('Room type');
      const [hostel] = await tx.select().from(schema.hostels).where(eq(schema.hostels.id, room.hostelId));
      if (!hostel || !isBookable(hostel, await planFor(hostel.id, tx))) {
        throw new AppError('not_verified', 'You can only move to a verified partner hostel');
      }
      // Same rule as subscribing: never a plan at your own hostel.
      if (hostel.ownerId === user.id) {
        throw new AppError('cannot_subscribe_own_hostel', 'You own that hostel, so you can’t move your plan there.', 409);
      }
      // The food plan they will have there: a scheduled change from the next bill counts too.
      const change = await scheduledFoodChange(tx, sub.id);
      const eats = sub.mealPlan !== 'none' || (change !== null && change.mealPlan !== 'none');
      if (eats && !hostel.foodAvailable) throw new AppError('move_not_allowed', 'That hostel does not serve food');
      if (!(await reserveBed(tx, room.id))) throw new AppError('no_beds_available', 'No beds left in that room type');
      const [move] = await tx
        .insert(schema.moveRequests)
        .values({
          id: newId('mov'),
          subscriptionId: sub.id,
          fromHostelId: sub.hostelId,
          fromRoomTypeId: sub.roomTypeId,
          toHostelId: hostel.id,
          toRoomTypeId: room.id,
          moveDate: input.moveDate,
          createdAt: clock.now(),
        })
        .returning();
      // Bills already generated for periods from the move date on now use the new room.
      await regenerateUnpaidFrom(tx, sub, input.moveDate);
      return toMove(move!);
    });
  } catch (e) {
    if (isUniqueViolation(e, 'move_requests_one_scheduled')) {
      throw new AppError('move_not_allowed', 'You already have a move scheduled; cancel it first');
    }
    throw e;
  }
}

export async function cancelMove(user: User, moveId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sub = await openSubscription(user.id, tx);
    const [move] = await tx.select().from(schema.moveRequests).where(eq(schema.moveRequests.id, moveId));
    if (!sub || !move || move.subscriptionId !== sub.id) throw notFound('Move');
    if (move.status !== 'scheduled') throw new AppError('move_not_allowed', 'This move is no longer scheduled');
    if (move.moveDate <= clock.today()) throw new AppError('move_not_allowed', 'Moves can be cancelled until the day before');
    const [cancelled] = await tx
      .update(schema.moveRequests)
      .set({ status: 'cancelled' })
      .where(and(eq(schema.moveRequests.id, move.id), eq(schema.moveRequests.status, 'scheduled')))
      .returning();
    if (!cancelled) throw new AppError('move_not_allowed', 'This move is no longer scheduled');
    await releaseBed(tx, move.toRoomTypeId);
    await regenerateUnpaidFrom(tx, sub, move.moveDate);
    await settlePaidBillsOfCancelledMove(tx, move);
    return toMove(cancelled);
  });
}

export async function myMoves(user: User) {
  const sub = await openSubscription(user.id);
  if (!sub) return [];
  const rows = await getDb().select().from(schema.moveRequests).where(eq(schema.moveRequests.subscriptionId, sub.id));
  return rows.map(toMove);
}

/** Why a hostel can't take a move-in, in the tenant's words (never the owner's unpaid bill); null when it can. */
function closedReason(hostel: typeof schema.hostels.$inferSelect | undefined, plan: PlanState): string | null {
  if (!hostel || hostel.status !== 'live') return `${hostel?.name ?? 'That hostel'} is no longer listed on Hostels`;
  if (hostel.partnerStatus !== 'verified') return `${hostel.name} is no longer a verified partner`;
  if (plan.suspended) return `${hostel.name} isn't taking new residents right now`;
  return null;
}

/**
 * Job: on the move date, switch the subscription, release the old bed and move the residency. A move into a hostel
 * that stopped taking residents (delisted, no longer verified, or paused) is cancelled instead: the bed held there
 * is released, unpaid bills go back to the current room, the reason is kept for the tenant, and they stay put.
 */
export async function completeDueMoves(today = clock.today()) {
  const db = getDb();
  const due = await db
    .select()
    .from(schema.moveRequests)
    .where(and(eq(schema.moveRequests.status, 'scheduled'), lte(schema.moveRequests.moveDate, today)));
  let done = 0;
  let cancelled = 0;
  for (const m of due) {
    await db.transaction(async (tx) => {
      const [hostel] = await tx.select().from(schema.hostels).where(eq(schema.hostels.id, m.toHostelId));
      const reason = closedReason(hostel, await planFor(m.toHostelId, tx));
      if (reason) {
        const [row] = await tx
          .update(schema.moveRequests)
          .set({ status: 'cancelled', cancelReason: reason })
          .where(and(eq(schema.moveRequests.id, m.id), eq(schema.moveRequests.status, 'scheduled')))
          .returning();
        if (!row) return;
        await releaseBed(tx, m.toRoomTypeId);
        const [sub] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, m.subscriptionId));
        // With the move gone, bills from the move date on are made again for the room they're in now.
        if (sub) await regenerateUnpaidFrom(tx, sub, m.moveDate);
        await settlePaidBillsOfCancelledMove(tx, m);
        cancelled++;
        return;
      }
      const [row] = await tx
        .update(schema.moveRequests)
        .set({ status: 'completed' })
        .where(and(eq(schema.moveRequests.id, m.id), eq(schema.moveRequests.status, 'scheduled')))
        .returning();
      if (!row) return;
      const [sub] = await tx
        .update(schema.subscriptions)
        .set({ hostelId: m.toHostelId, roomTypeId: m.toRoomTypeId })
        .where(eq(schema.subscriptions.id, m.subscriptionId))
        .returning();
      await releaseBed(tx, m.fromRoomTypeId);
      const [old] = await tx
        .update(schema.residencies)
        .set({ status: 'ended', endDate: addDays(m.moveDate, -1) })
        .where(and(eq(schema.residencies.subscriptionId, m.subscriptionId), eq(schema.residencies.status, 'active')))
        .returning();
      if (old) {
        await tx.insert(schema.residencies).values({
          id: newId('res'),
          userId: sub!.userId,
          phone: old.phone,
          name: old.name,
          hostelId: m.toHostelId,
          roomTypeId: m.toRoomTypeId,
          source: 'subscription',
          subscriptionId: m.subscriptionId,
          startDate: m.moveDate,
          status: 'active',
        });
      }
      done++;
    });
  }
  return { completed: done, cancelled };
}

/** Newest first, a page at a time; id breaks ties so pages never repeat or skip a row. */
export async function adminMoves(page: { limit?: number; offset?: number } = {}) {
  const m = schema.moveRequests;
  const rows = await getDb()
    .select()
    .from(m)
    .orderBy(desc(m.createdAt), desc(m.id))
    .limit(page.limit ?? 100)
    .offset(page.offset ?? 0);
  return rows.map(toMove);
}
