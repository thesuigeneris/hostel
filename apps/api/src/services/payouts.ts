import type { OwnerPayouts, Payout, User } from '@hostels/shared';
import { computePayout, newId } from '@hostels/shared';
import { and, desc, eq, gte, lt, notInArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { AppError, notFound } from '../lib/errors';
import { monthBounds, realTenantMoney, tenantNotCounted } from './money';

function toPayout(r: typeof schema.payouts.$inferSelect): Payout {
  const { createdAt: _c, ...rest } = r;
  return { ...rest, paidAt: r.paidAt?.toISOString() ?? null };
}

/**
 * For each partner hostel: gross = tenant bills at that hostel paid with real money (Razorpay live) with paidAt in the
 * month, fee = gross × fee %. Simulated and test-mode payments are never paid out. Idempotent per hostel-month:
 * pending payouts are recomputed (and dropped if no real money is behind them any more), paid ones are left alone.
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
    .where(and(realTenantMoney(), gte(schema.invoices.paidAt, from), lt(schema.invoices.paidAt, to)))
    .groupBy(schema.invoices.hostelId);
  await db
    .delete(schema.payouts)
    .where(
      and(
        eq(schema.payouts.periodMonth, month),
        eq(schema.payouts.status, 'pending'),
        totals.length ? notInArray(schema.payouts.hostelId, totals.map((t) => t.hostelId)) : undefined,
      ),
    );
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

/** This month so far, for the owner dashboard: real money only, with what was left out beside it. */
export async function ownerPayouts(user: User): Promise<OwnerPayouts> {
  const month = clock.today().slice(0, 7);
  const { from, to } = monthBounds(month);
  const db = getDb();
  const [live, mine] = await Promise.all([
    db
      .select({ hostelId: schema.invoices.hostelId, name: schema.hostels.name, pct: schema.hostels.platformFeePct, gross: sql<number>`sum(${schema.invoices.totalAmount})::int` })
      .from(schema.invoices)
      .innerJoin(schema.hostels, eq(schema.hostels.id, schema.invoices.hostelId))
      .where(and(eq(schema.hostels.ownerId, user.id), realTenantMoney(), gte(schema.invoices.paidAt, from), lt(schema.invoices.paidAt, to)))
      .groupBy(schema.invoices.hostelId, schema.hostels.name, schema.hostels.platformFeePct),
    db.select({ id: schema.hostels.id }).from(schema.hostels).where(eq(schema.hostels.ownerId, user.id)),
  ]);
  return {
    history: await listPayouts({ ownerId: user.id }),
    thisMonth: {
      month,
      hostels: live.map((l) => ({ hostelId: l.hostelId, hostelName: l.name, ...computePayout(l.gross, l.pct) })),
      notCounted: await tenantNotCounted(month, mine.map((h) => h.id)),
    },
  };
}
