import { and, eq, gt, sql } from 'drizzle-orm';
import { schema, type DbOrTx } from '../db';
import { err } from '../lib/http';

/** Take one bed atomically; throws no_beds_available when none are free. Never overbooks. */
export async function reserveBed(tx: DbOrTx, roomTypeId: string) {
  const rows = await tx
    .update(schema.roomTypes)
    .set({ bedsAvailable: sql`${schema.roomTypes.bedsAvailable} - 1` })
    .where(and(eq(schema.roomTypes.id, roomTypeId), gt(schema.roomTypes.bedsAvailable, 0)))
    .returning({ id: schema.roomTypes.id });
  if (rows.length === 0) throw err.conflict('no_beds_available', 'No beds are free in this room type');
}

/** Give a bed back, never exceeding the room's total. */
export async function releaseBed(tx: DbOrTx, roomTypeId: string) {
  await tx
    .update(schema.roomTypes)
    .set({ bedsAvailable: sql`least(${schema.roomTypes.bedsAvailable} + 1, ${schema.roomTypes.totalBeds})` })
    .where(eq(schema.roomTypes.id, roomTypeId));
}
