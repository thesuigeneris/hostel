import type { NotCounted, PaymentMode, PlatformRevenue } from '@hostels/shared';
import { addMonths, computePayout, istInstant, REAL_MONEY_MODES } from '@hostels/shared';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';

// Every money figure (payouts, platform revenue, owner insights) is built from the predicates here, so simulated
// payments, Razorpay test-mode payments and waived bills can never be counted as money received.

const inv = schema.invoices;
const oin = schema.ownerInvoices;

/** Bounds of a calendar month in IST, as instants. */
export function monthBounds(month: string) {
  const first = `${month}-01`;
  return { from: istInstant(first, 0), to: istInstant(addMonths(first, 1), 0) };
}

const realModes = () => [...REAL_MONEY_MODES];

/** A tenant bill paid with real money. */
export const realTenantMoney = () => and(eq(inv.status, 'paid'), inArray(inv.paymentMode, realModes()));
/** An owner plan bill paid with real money. Waived bills are void, so they never match. */
export const realOwnerMoney = () => and(eq(oin.status, 'paid'), inArray(oin.paymentMode, realModes()));

/** What per-mode sums leave out of the money figures: simulated and Razorpay test-mode payments. */
export function notCounted(rows: { mode: PaymentMode | null; amount: number }[]): NotCounted {
  const out: NotCounted = { simulated: 0, test: 0 };
  for (const r of rows) {
    if (r.mode === 'simulated') out.simulated += r.amount;
    else if (r.mode === 'razorpay_test') out.test += r.amount;
  }
  return out;
}

/** Tenant bills paid in `month` without real money, at the given hostels (all hostels when omitted). */
export async function tenantNotCounted(month: string, hostelIds?: string[]): Promise<NotCounted> {
  if (hostelIds && !hostelIds.length) return { simulated: 0, test: 0 };
  const { from, to } = monthBounds(month);
  const rows = await getDb()
    .select({ mode: inv.paymentMode, amount: sql<number>`sum(${inv.totalAmount})::int` })
    .from(inv)
    .where(and(eq(inv.status, 'paid'), gte(inv.paidAt, from), lt(inv.paidAt, to), hostelIds ? inArray(inv.hostelId, hostelIds) : undefined))
    .groupBy(inv.paymentMode);
  return notCounted(rows);
}

/**
 * What the platform took in during `month`: platform fees on tenant bills and owner plan bills, real money only, with
 * the fee worked out per hostel exactly as payouts do. What was left out is reported beside it.
 */
export async function platformRevenue(month: string): Promise<PlatformRevenue> {
  const { from, to } = monthBounds(month);
  const db = getDb();
  const [byHostel, owner, tenantLeftOut] = await Promise.all([
    db
      .select({ gross: sql<number>`sum(${inv.totalAmount})::int`, pct: schema.hostels.platformFeePct })
      .from(inv)
      .innerJoin(schema.hostels, eq(schema.hostels.id, inv.hostelId))
      .where(and(realTenantMoney(), gte(inv.paidAt, from), lt(inv.paidAt, to)))
      .groupBy(inv.hostelId, schema.hostels.platformFeePct),
    db
      .select({ mode: oin.paymentMode, amount: sql<number>`sum(${oin.amount})::int` })
      .from(oin)
      .where(and(eq(oin.status, 'paid'), gte(oin.paidAt, from), lt(oin.paidAt, to)))
      .groupBy(oin.paymentMode),
    tenantNotCounted(month),
  ]);
  let subscriptionGross = 0;
  let platformFees = 0;
  for (const h of byHostel) {
    const p = computePayout(h.gross, h.pct);
    subscriptionGross += p.grossAmount;
    platformFees += p.platformFee;
  }
  const isReal = (mode: PaymentMode | null) => (REAL_MONEY_MODES as readonly (PaymentMode | null)[]).includes(mode);
  return {
    month,
    subscriptionGross,
    platformFees,
    ownerPlans: owner.filter((r) => isReal(r.mode)).reduce((n, r) => n + r.amount, 0),
    notCounted: { tenant: tenantLeftOut, owner: notCounted(owner) },
  };
}

/** The admin home: this month so far, and how many paid plans are still in their free month. */
export async function adminRevenue() {
  const today = clock.today();
  const [revenue, plans] = await Promise.all([
    platformRevenue(today.slice(0, 7)),
    getDb()
      .select({ trialEndsOn: schema.ownerPlans.trialEndsOn })
      .from(schema.ownerPlans)
      .where(and(inArray(schema.ownerPlans.plan, ['pro', 'partner']), eq(schema.ownerPlans.suspended, false))),
  ]);
  return { ...revenue, trialHostels: plans.filter((p) => p.trialEndsOn && p.trialEndsOn >= today).length };
}
