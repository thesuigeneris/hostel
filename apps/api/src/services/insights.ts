import type { IssueCategory, OwnerInsights, User } from '@hostels/shared';
import { addDays, computePayout, istInstant, TRANSPARENCY_WINDOW_DAYS } from '@hostels/shared';
import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { seenWithin } from '../lib/rate-limit';
import { ownedHostel, planFor } from './access';
import { ratingsFor } from './listings';
import { monthBounds, realTenantMoney, tenantNotCounted } from './money';
import { rentSheet } from './residents';

const INSIGHT_DAYS = 30;
const HOUR = 3600_000;

/** A visitor counts as one view per hostel per half hour, however often the page loads. */
export const VIEW_DEDUPE_SECONDS = 30 * 60;

/**
 * Count one page view for a live hostel today. Unknown or non-live slugs are ignored, and so are the owner looking at
 * their own page and a visitor (signed-in person, else network address) seen in the last half hour, so a script
 * reloading the page can't inflate the owner's insights. Returns whether it counted.
 */
export async function recordView(slug: string, visitor: { userId: string | null; ip: string }) {
  const db = getDb();
  const [h] = await db
    .select({ id: schema.hostels.id, ownerId: schema.hostels.ownerId })
    .from(schema.hostels)
    .where(and(eq(schema.hostels.slug, slug), eq(schema.hostels.status, 'live')));
  if (!h || h.ownerId === visitor.userId) return false;
  if (seenWithin(`view:${h.id}`, visitor.userId ? `user:${visitor.userId}` : `ip:${visitor.ip}`, VIEW_DEDUPE_SECONDS)) return false;
  const v = schema.hostelViews;
  await db
    .insert(v)
    .values({ hostelId: h.id, day: clock.today(), count: 1 })
    .onConflictDoUpdate({ target: [v.hostelId, v.day], set: { count: sql`${v.count} + 1` } });
  return true;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return Math.round(m * 10) / 10;
}

/**
 * Owner insights for one hostel. The summary (occupancy %, visit requests, open issues, rating) and issue health
 * are free; page views, room-level occupancy and the money for `month` need Pro or Partner (the "occupancy view"
 * in the plan table). A paused plan sees the Free set until the bill is paid.
 */
export async function ownerInsights(user: User, hostelId: string, month = clock.today().slice(0, 7)): Promise<OwnerInsights> {
  const h = await ownedHostel(user, hostelId);
  const db = getDb();
  const now = clock.now();
  const today = clock.today();
  const viewsSince = addDays(today, -(INSIGHT_DAYS - 1));
  const issuesSince = istInstant(addDays(today, -TRANSPARENCY_WINDOW_DAYS), 0);

  const [plan, ratings, rooms, [visits30d], [residents], issues, views, [unreplied], visitCounts] = await Promise.all([
    planFor(h.id),
    ratingsFor(h.id),
    db.select().from(schema.roomTypes).where(eq(schema.roomTypes.hostelId, h.id)).orderBy(asc(schema.roomTypes.monthlyRent)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.visitRequests)
      .where(and(eq(schema.visitRequests.hostelId, h.id), gte(schema.visitRequests.createdAt, istInstant(viewsSince, 0)))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.residencies)
      .where(and(eq(schema.residencies.hostelId, h.id), eq(schema.residencies.status, 'active'))),
    db.select().from(schema.issues).where(eq(schema.issues.hostelId, h.id)),
    db
      .select({ day: schema.hostelViews.day, count: schema.hostelViews.count })
      .from(schema.hostelViews)
      .where(and(eq(schema.hostelViews.hostelId, h.id), gte(schema.hostelViews.day, viewsSince))),
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
  const locked = plan.effective === 'free';
  const totalBeds = rooms.reduce((n, r) => n + r.totalBeds, 0);
  const freeBeds = rooms.reduce((n, r) => n + r.bedsAvailable, 0);
  const occupancyPct = totalBeds ? Math.round(((totalBeds - freeBeds) / totalBeds) * 100) : 0;

  const byDay = new Map(views.map((v) => [v.day, v.count]));
  const viewsByDay = Array.from({ length: INSIGHT_DAYS }, (_, k) => {
    const day = addDays(viewsSince, k);
    return { day, count: byDay.get(day) ?? 0 };
  });

  // Issues: open ones by age, plus 90-day response times and categories.
  const open = issues.filter((i) => i.status !== 'resolved' && i.status !== 'closed');
  const openByAge = { under1Day: 0, days1to3: 0, days3to7: 0, over7Days: 0 };
  for (const i of open) {
    const hours = (now.getTime() - i.createdAt.getTime()) / HOUR;
    if (hours < 24) openByAge.under1Day++;
    else if (hours < 72) openByAge.days1to3++;
    else if (hours < 168) openByAge.days3to7++;
    else openByAge.over7Days++;
  }
  const recent = issues.filter((i) => i.createdAt >= issuesSince);
  const byCategory: Partial<Record<IssueCategory, number>> = {};
  for (const i of recent) byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;

  let occupancy: OwnerInsights['occupancy'] = null;
  let revenue: OwnerInsights['revenue'] = null;
  if (!locked) {
    const { from, to } = monthBounds(month);
    const [[subscribers], [gross], [planDue], rent, leftOut] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.subscriptions)
        .where(and(eq(schema.subscriptions.hostelId, h.id), eq(schema.subscriptions.status, 'active'))),
      db
        .select({ n: sql<number>`coalesce(sum(${schema.invoices.totalAmount}), 0)::int` })
        .from(schema.invoices)
        .where(and(eq(schema.invoices.hostelId, h.id), realTenantMoney(), gte(schema.invoices.paidAt, from), lt(schema.invoices.paidAt, to))),
      db
        .select({ n: sql<number>`coalesce(sum(${schema.ownerInvoices.amount}), 0)::int` })
        .from(schema.ownerInvoices)
        .where(and(eq(schema.ownerInvoices.hostelId, h.id), eq(schema.ownerInvoices.status, 'due'))),
      rentSheet(user, h.id, month),
      tenantNotCounted(month, [h.id]),
    ]);
    occupancy = {
      totalBeds,
      freeBeds,
      occupiedBeds: totalBeds - freeBeds,
      occupancyPct: totalBeds ? occupancyPct : null,
      activeResidents: residents?.n ?? 0,
      activeSubscribers: subscribers?.n ?? 0,
      rooms: rooms.map((r) => ({ roomTypeId: r.id, sharing: r.sharing, totalBeds: r.totalBeds, bedsAvailable: r.bedsAvailable, monthlyRent: r.monthlyRent })),
    };
    const payout = computePayout(gross?.n ?? 0, h.platformFeePct);
    revenue = {
      subscriptionGross: payout.grossAmount,
      platformFeePct: h.platformFeePct,
      platformFee: payout.platformFee,
      subscriptionNet: payout.netAmount,
      notCounted: leftOut,
      rentDue: rent.totals.due,
      rentCollected: rent.totals.collected,
      planBillDue: planDue?.n ?? 0,
    };
  }

  const visitsByStatus = Object.fromEntries(visitCounts.map((v) => [v.status, v.n]));
  return {
    hostelId: h.id,
    month,
    plan,
    locked,
    views30d: locked ? null : viewsByDay.reduce((n, d) => n + d.count, 0),
    viewsByDay: locked ? null : viewsByDay,
    visitRequests30d: visits30d?.n ?? 0,
    occupancyPct,
    activeResidents: residents?.n ?? 0,
    openIssues: open.length,
    rating: ratings.rating,
    reviewCount: ratings.reviewCount,
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
    reviews: { rating: ratings.rating, count: ratings.reviewCount, awaitingReply: unreplied?.n ?? 0 },
    visits: { new: visitsByStatus.new ?? 0, contacted: visitsByStatus.contacted ?? 0 },
  };
}
