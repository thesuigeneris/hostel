import type { Payout, User } from '@hostels/shared';
import { addMonths, computePayout, istInstant, newId } from '@hostels/shared';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { AppError, notFound } from '../lib/errors';

function toPayout(r: typeof schema.payouts.$inferSelect): Payout {
  const { createdAt: _c, ...rest } = r;
  return { ...rest, paidAt: r.paidAt?.toISOString() ?? null };
}

/** Bounds of a calendar month in IST, as instants. */
export function monthBounds(month: string) {
  const first = `${month}-01`;
  return { from: istInstant(first, 0), to: istInstant(addMonths(first, 1), 0) };
}

/**
 * For each partner hostel: gross = paid tenant bills at that hostel with paidAt in the month, fee = gross × fee %.
 * Idempotent per hostel-month: pending payouts are recomputed, paid ones are left alone.
 */
export async function generatePayouts(month: string) {
  if (month >= clock.today().slice(0, 7)) throw new AppError('invalid_state', 'Payouts can only be generated for a finished month');
  const db = getDb();
  const { from, to } = monthBounds(month);
  const totals = await db
    .select({
      hostelId: schema.invoices.hostelId,
      gross: sql<number>`sum(${schema.invoices.totalAmount})::int`,
    })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.status, 'paid'), gte(schema.invoices.paidAt, from), lt(schema.invoices.paidAt, to)))
    .groupBy(schema.invoices.hostelId);
  const results = [];
  for (const t of totals) {
    const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, t.hostelId));
    if (!h) continue;
    const amounts = computePayout(t.gross, h.platformFeePct);
    const [row] = await db
      .insert(schema.payouts)
      .values({ id: newId('pay'), ownerId: h.ownerId, hostelId: h.id, periodMonth: month, ...amounts })
      .onConflictDoUpdate({
        target: [schema.payouts.hostelId, schema.payouts.periodMonth],
        set: amounts,
        setWhere: sql`${schema.payouts.status} = 'pending'`,
      })
      .returning();
    if (row) results.push(toPayout(row));
  }
  return listPayouts({ month });
}

export async function markPayoutPaid(id: string) {
  const db = getDb();
  const [row] = await db
    .update(schema.payouts)
    .set({ status: 'paid', paidAt: clock.now() })
    .where(and(eq(schema.payouts.id, id), eq(schema.payouts.status, 'pending')))
    .returning();
  if (row) return toPayout(row);
  const [existing] = await db.select().from(schema.payouts).where(eq(schema.payouts.id, id));
  if (!existing) throw notFound('Payout');
  return toPayout(existing);
}

export async function listPayouts(filter: { month?: string; ownerId?: string } = {}) {
  const rows = await getDb()
    .select({ payout: schema.payouts, hostelName: schema.hostels.name })
    .from(schema.payouts)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.payouts.hostelId))
    .where(
      and(
        filter.month ? eq(schema.payouts.periodMonth, filter.month) : undefined,
        filter.ownerId ? eq(schema.payouts.ownerId, filter.ownerId) : undefined,
      ),
    )
    .orderBy(desc(schema.payouts.periodMonth), schema.hostels.name);
  return rows.map((r) => ({ ...toPayout(r.payout), hostelName: r.hostelName }));
}

/** This month so far, for the owner dashboard. */
export async function ownerPayouts(user: User) {
  const month = clock.today().slice(0, 7);
  const { from, to } = monthBounds(month);
  const db = getDb();
  const live = await db
    .select({ hostelId: schema.invoices.hostelId, name: schema.hostels.name, pct: schema.hostels.platformFeePct, gross: sql<number>`sum(${schema.invoices.totalAmount})::int` })
    .from(schema.invoices)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.invoices.hostelId))
    .where(and(eq(schema.hostels.ownerId, user.id), eq(schema.invoices.status, 'paid'), gte(schema.invoices.paidAt, from), lt(schema.invoices.paidAt, to)))
    .groupBy(schema.invoices.hostelId, schema.hostels.name, schema.hostels.platformFeePct);
  return {
    history: await listPayouts({ ownerId: user.id }),
    thisMonth: { month, hostels: live.map((l) => ({ hostelId: l.hostelId, hostelName: l.name, ...computePayout(l.gross, l.pct) })) },
  };
}
