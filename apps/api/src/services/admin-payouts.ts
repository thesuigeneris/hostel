/** Monthly partner payouts. Base spec §4: gross = paid bills for stays at the hostel with paidAt (IST) in the month. */
import { and, desc, eq, sql } from 'drizzle-orm';
import { newId, payoutAmounts } from '@hostels/shared';
import { db, schema } from '../db';
import { err } from '../lib/http';

type PayoutRow = typeof schema.payouts.$inferSelect;

/** Idempotent per hostel-month: existing payouts are kept as they are. Returns all payouts for the month. */
export async function generatePayouts(periodMonth: string): Promise<PayoutRow[]> {
  const i = schema.invoices;
  const sums = await db
    .select({ hostelId: i.hostelId, gross: sql<number>`coalesce(sum(${i.totalAmount}), 0)`.mapWith(Number) })
    .from(i)
    .where(and(eq(i.status, 'paid'), sql`to_char(${i.paidAt} at time zone 'Asia/Kolkata', 'YYYY-MM') = ${periodMonth}`))
    .groupBy(i.hostelId);
  for (const s of sums) {
    if (s.gross <= 0) continue;
    const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, s.hostelId));
    if (!h) continue;
    await db
      .insert(schema.payouts)
      .values({ id: newId('pay'), ownerId: h.ownerId, hostelId: h.id, periodMonth, ...payoutAmounts(s.gross, h.platformFeePct) })
      .onConflictDoNothing({ target: [schema.payouts.hostelId, schema.payouts.periodMonth] });
  }
  return listPayouts({ periodMonth });
}

export async function listPayouts(q: { periodMonth?: string; ownerId?: string }): Promise<PayoutRow[]> {
  return db
    .select()
    .from(schema.payouts)
    .where(and(q.periodMonth ? eq(schema.payouts.periodMonth, q.periodMonth) : undefined, q.ownerId ? eq(schema.payouts.ownerId, q.ownerId) : undefined))
    .orderBy(desc(schema.payouts.periodMonth), schema.payouts.hostelId);
}

export async function markPayoutPaid(id: string): Promise<PayoutRow> {
  const [p] = await db.select().from(schema.payouts).where(eq(schema.payouts.id, id));
  if (!p) throw err.notFound('Payout');
  if (p.status === 'paid') return p;
  const [u] = await db.update(schema.payouts).set({ status: 'paid', paidAt: new Date() }).where(eq(schema.payouts.id, id)).returning();
  return u!;
}
