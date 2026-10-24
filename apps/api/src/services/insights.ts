import type { IssueCategory, OwnerInsights, User } from '@hostels/shared';
import { addDays, computePayout, istInstant, TRANSPARENCY_WINDOW_DAYS } from '@hostels/shared';
import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { ownedHostel, planFor } from './access';
import { ratingsFor } from './listings';
import { monthBounds } from './payouts';
import { rentSheet } from './residents';

const HOUR = 3600_000;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return Math.round(m * 10) / 10;
}

/**
 * The owner dashboard for one hostel: issue health for every plan; occupancy and money for Pro and Partner
 * (the "occupancy view" in the plan table). Paused plans see the Free set until the bill is paid.
 */
export async function hostelInsights(user: User, hostelId: string, month: string): Promise<OwnerInsights> {
  const h = await ownedHostel(user, hostelId);
  const db = getDb();
  const plan = await planFor(h.id);
  const paid = plan.effective !== 'free';
  const now = clock.now();

  // Issues: open ones by age, plus 90-day response times and categories.
  const since = istInstant(addDays(clock.today(), -TRANSPARENCY_WINDOW_DAYS), 0);
  const issues = await db.select().from(schema.issues).where(eq(schema.issues.hostelId, h.id));
  const open = issues.filter((i) => i.status !== 'resolved' && i.status !== 'closed');
  const openByAge = { under1Day: 0, days1to3: 0, days3to7: 0, over7Days: 0 };
  for (const i of open) {
    const hours = (now.getTime() - i.createdAt.getTime()) / HOUR;
    if (hours < 24) openByAge.under1Day++;
    else if (hours < 72) openByAge.days1to3++;
    else if (hours < 168) openByAge.days3to7++;
    else openByAge.over7Days++;
  }
  const recent = issues.filter((i) => i.createdAt >= since);
  const byCategory: Partial<Record<IssueCategory, number>> = {};
  for (const i of recent) byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;

  const [ratings, unreplied, visitCounts] = await Promise.all([
    ratingsFor(h.id),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reviews)
      .where(and(eq(schema.reviews.hostelId, h.id), eq(schema.reviews.hidden, false), isNull(schema.reviews.ownerReply))),
    db
      .select({ status: schema.visitRequests.status, n: sql<number>`count(*)::int` })
      .from(schema.visitRequests)
      .where(eq(schema.visitRequests.hostelId, h.id))
      .groupBy(schema.visitRequests.status),
  ]);

  let occupancy: OwnerInsights['occupancy'] = null;
  let revenue: OwnerInsights['revenue'] = null;
  if (paid) {
    const { from, to } = monthBounds(month);
    const [rooms, residents, subscribers, gross, planDue, rent] = await Promise.all([
      db.select().from(schema.roomTypes).where(eq(schema.roomTypes.hostelId, h.id)).orderBy(asc(schema.roomTypes.monthlyRent)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.residencies)
        .where(and(eq(schema.residencies.hostelId, h.id), eq(schema.residencies.status, 'active'))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.subscriptions)
        .where(and(eq(schema.subscriptions.hostelId, h.id), eq(schema.subscriptions.status, 'active'))),
      db
        .select({ n: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)::int` })
        .from(schema.invoices)
        .where(and(eq(schema.invoices.hostelId, h.id), eq(schema.invoices.status, 'paid'), gte(schema.invoices.paidAt, from), lt(schema.invoices.paidAt, to))),
      db
        .select({ n: sql<number>`coalesce(sum(${schema.ownerInvoices.amount}), 0)::int` })
        .from(schema.ownerInvoices)
        .where(and(eq(schema.ownerInvoices.hostelId, h.id), inArray(schema.ownerInvoices.status, ['due']))),
      rentSheet(user, h.id, month),
    ]);
    const totalBeds = rooms.reduce((n, r) => n + r.totalBeds, 0);
    const freeBeds = rooms.reduce((n, r) => n + r.bedsAvailable, 0);
    occupancy = {
      totalBeds,
      freeBeds,
      occupiedBeds: totalBeds - freeBeds,
      occupancyPct: totalBeds ? Math.round(((totalBeds - freeBeds) / totalBeds) * 100) : null,
      activeResidents: residents[0]!.n,
      activeSubscribers: subscribers[0]!.n,
      rooms: rooms.map((r) => ({ roomTypeId: r.id, sharing: r.sharing, totalBeds: r.totalBeds, bedsAvailable: r.bedsAvailable, monthlyRent: r.monthlyRent })),
    };
    const payout = computePayout(gross[0]!.n, h.platformFeePct);
    revenue = {
      subscriptionGross: payout.grossAmount,
      platformFeePct: h.platformFeePct,
      platformFee: payout.platformFee,
      subscriptionNet: payout.netAmount,
      rentDue: rent.totals.due,
      rentCollected: rent.totals.collected,
      planBillDue: planDue[0]!.n,
    };
  }

  const visits = Object.fromEntries(visitCounts.map((v) => [v.status, v.n]));
  return {
    hostelId: h.id,
    month,
    plan,
    occupancy,
    revenue,
    issues: {
      open: open.length,
      needsResponse: open.filter((i) => i.status === 'open' && now.getTime() - i.createdAt.getTime() > 24 * HOUR).length,
      openByAge,
      byCategory,
      reportedLast90Days: recent.length,
      medianHoursToFirstResponse: median(recent.filter((i) => i.acknowledgedAt).map((i) => (i.acknowledgedAt!.getTime() - i.createdAt.getTime()) / HOUR)),
      medianHoursToResolve: median(recent.filter((i) => i.resolvedAt).map((i) => (i.resolvedAt!.getTime() - i.createdAt.getTime()) / HOUR)),
    },
    reviews: { rating: ratings.rating, count: ratings.reviewCount, awaitingReply: unreplied[0]!.n },
    visits: { new: visits.new ?? 0, contacted: visits.contacted ?? 0 },
  };
}
