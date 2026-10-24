/** Moving between partner hostels (base spec §4 "Move", §6 "Move"). */
import { and, eq } from 'drizzle-orm';
import type { MoveInput } from '@hostels/shared';
import { addDays, istDate, newId } from '@hostels/shared';
import { db, schema } from '../db';
import { err } from '../lib/http';
import { isUniqueViolation } from './pg-errors';
import { toMoveRequest } from '../lib/serialize-tenant';
import { regenerateUnpaidFrom } from './billing';
import { releaseBed, reserveBed } from './beds';
import { currentSubscription } from './subscriptions';

export const MOVE_HORIZON_DAYS = 60;

export async function scheduleMove(userId: string, input: MoveInput, now = new Date()) {
  const today = istDate(now);
  return db
    .transaction(async (tx) => {
      const sub = await currentSubscription(userId, tx);
      if (!sub || sub.status !== 'active') throw err.domain('move_not_allowed', 'You need an active plan to move');
      if (input.moveDate < addDays(today, 1)) throw err.domain('move_not_allowed', 'Pick a move date from tomorrow onwards');
      if (input.moveDate > addDays(today, MOVE_HORIZON_DAYS)) throw err.domain('move_not_allowed', `Pick a date within ${MOVE_HORIZON_DAYS} days`);
      if (input.moveDate <= sub.startDate) throw err.domain('move_not_allowed', 'You can move after your plan starts');
      if (input.toRoomTypeId === sub.roomTypeId) throw err.domain('move_not_allowed', 'You are already in that room');

      const [existing] = await tx
        .select({ id: schema.moveRequests.id })
        .from(schema.moveRequests)
        .where(and(eq(schema.moveRequests.subscriptionId, sub.id), eq(schema.moveRequests.status, 'scheduled')));
      if (existing) throw err.conflict('move_not_allowed', 'You already have a move scheduled. Cancel it first.');

      const [hostel] = await tx.select().from(schema.hostels).where(eq(schema.hostels.id, input.toHostelId));
      if (!hostel || hostel.status !== 'live') throw err.notFound('Hostel');
      if (hostel.partnerStatus !== 'verified') throw err.domain('not_verified', 'You can only move to a verified partner hostel');
      const [room] = await tx
        .select()
        .from(schema.roomTypes)
        .where(and(eq(schema.roomTypes.id, input.toRoomTypeId), eq(schema.roomTypes.hostelId, hostel.id)));
      if (!room) throw err.notFound('Room type');

      await reserveBed(tx, room.id);
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
      await regenerateUnpaidFrom(sub, input.moveDate, tx);
      return toMoveRequest(move!);
    })
    .catch((e) => {
      if (isUniqueViolation(e)) throw err.conflict('move_not_allowed', 'You already have a move scheduled');
      throw e;
    });
}

export async function cancelMove(userId: string, moveId: string, now = new Date()) {
  const today = istDate(now);
  return db.transaction(async (tx) => {
    const sub = await currentSubscription(userId, tx);
    const [move] = await tx.select().from(schema.moveRequests).where(eq(schema.moveRequests.id, moveId));
    if (!sub || !move || move.subscriptionId !== sub.id) throw err.notFound('Move');
    if (move.status !== 'scheduled') throw err.domain('move_not_allowed', 'This move is no longer scheduled');
    if (move.moveDate <= today) throw err.domain('move_not_allowed', 'It is too late to cancel this move');
    const [cancelled] = await tx
      .update(schema.moveRequests)
      .set({ status: 'cancelled' })
      .where(and(eq(schema.moveRequests.id, move.id), eq(schema.moveRequests.status, 'scheduled')))
      .returning();
    if (!cancelled) throw err.domain('move_not_allowed', 'This move is no longer scheduled');
    await releaseBed(tx, move.toRoomTypeId);
    await regenerateUnpaidFrom(sub, move.moveDate, tx);
    return toMoveRequest(cancelled);
  });
}
