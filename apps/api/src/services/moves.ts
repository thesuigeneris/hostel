import type { User } from '@hostels/shared';
import { addDays, newId } from '@hostels/shared';
import { and, eq, lte } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError, notFound } from '../lib/errors';
import { isBookable, planFor } from './access';
import { openSubscription, regenerateUnpaidFrom, releaseBed, reserveBed } from './billing';

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
      const [room] = await tx.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, input.toRoomTypeId));
      if (!room) throw notFound('Room type');
      const [hostel] = await tx.select().from(schema.hostels).where(eq(schema.hostels.id, room.hostelId));
      if (!hostel || !isBookable(hostel, await planFor(hostel.id, tx))) {
        throw new AppError('not_verified', 'You can only move to a verified partner hostel');
      }
      if (sub.mealPlan !== 'none' && !hostel.foodAvailable) throw new AppError('move_not_allowed', 'That hostel does not serve food');
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
    return toMove(cancelled);
  });
}

export async function myMoves(user: User) {
  const sub = await openSubscription(user.id);
  if (!sub) return [];
  const rows = await getDb().select().from(schema.moveRequests).where(eq(schema.moveRequests.subscriptionId, sub.id));
  return rows.map(toMove);
}

/** Job: on the move date, switch the subscription, release the old bed and move the residency. */
export async function completeDueMoves(today = clock.today()) {
  const db = getDb();
  const due = await db
    .select()
    .from(schema.moveRequests)
    .where(and(eq(schema.moveRequests.status, 'scheduled'), lte(schema.moveRequests.moveDate, today)));
  let done = 0;
  for (const m of due) {
    await db.transaction(async (tx) => {
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
  return done;
}

export async function adminMoves() {
  const rows = await getDb().select().from(schema.moveRequests);
  return rows.map(toMove).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
