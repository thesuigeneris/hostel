import { addDays, FOOD_PLANS, OWNER_PLANS, type OwnerInsights, type User } from '@hostels/shared';
import { and, eq, gte, inArray, notInArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { ownedHostel, planFor } from './access';
import { ratingsFor } from './listings';

const INSIGHT_DAYS = 30;

/** Count one page view for a live hostel today. Unknown or non-live slugs are ignored. */
export async function recordView(slug: string) {
  const db = getDb();
  const [h] = await db
    .select({ id: schema.hostels.id })
    .from(schema.hostels)
    .where(and(eq(schema.hostels.slug, slug), eq(schema.hostels.status, 'live')));
  if (!h) return;
  const v = schema.hostelViews;
  await db
    .insert(v)
    .values({ hostelId: h.id, day: clock.today(), count: 1 })
    .onConflictDoUpdate({ target: [v.hostelId, v.day], set: { count: sql`${v.count} + 1` } });
}

/** Owner insights for one hostel. View counts are a Pro/Partner feature; the rest is free. */
export async function ownerInsights(user: User, hostelId: string): Promise<OwnerInsights> {
  const h = await ownedHostel(user, hostelId);
  const db = getDb();
  const today = clock.today();
  const since = addDays(today, -(INSIGHT_DAYS - 1));
  const sinceTs = new Date(`${since}T00:00:00+05:30`);
  const [plan, ratings, rooms, [visits], [residents], [issues], views] = await Promise.all([
    planFor(h.id),
    ratingsFor(h.id),
    db
      .select({ total: schema.roomTypes.totalBeds, free: schema.roomTypes.bedsAvailable })
      .from(schema.roomTypes)
      .where(eq(schema.roomTypes.hostelId, h.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.visitRequests)
      .where(and(eq(schema.visitRequests.hostelId, h.id), gte(schema.visitRequests.createdAt, sinceTs))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.residencies)
      .where(and(eq(schema.residencies.hostelId, h.id), eq(schema.residencies.status, 'active'))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.issues)
      .where(and(eq(schema.issues.hostelId, h.id), notInArray(schema.issues.status, ['resolved', 'closed']))),
    db
      .select({ day: schema.hostelViews.day, count: schema.hostelViews.count })
      .from(schema.hostelViews)
      .where(and(eq(schema.hostelViews.hostelId, h.id), gte(schema.hostelViews.day, since))),
  ]);
  const totalBeds = rooms.reduce((n, r) => n + r.total, 0);
  const freeBeds = rooms.reduce((n, r) => n + r.free, 0);
  const locked = plan.effective === 'free';
  const byDay = new Map(views.map((v) => [v.day, v.count]));
  const viewsByDay = Array.from({ length: INSIGHT_DAYS }, (_, k) => {
    const day = addDays(since, k);
    return { day, count: byDay.get(day) ?? 0 };
  });
  return {
    hostelId: h.id,
    locked,
    views30d: locked ? null : viewsByDay.reduce((n, d) => n + d.count, 0),
    viewsByDay: locked ? null : viewsByDay,
    visitRequests30d: visits?.n ?? 0,
    occupancyPct: totalBeds ? Math.round(((totalBeds - freeBeds) / totalBeds) * 100) : 0,
    activeResidents: residents?.n ?? 0,
    openIssues: issues?.n ?? 0,
    rating: ratings.rating,
    reviewCount: ratings.reviewCount,
  };
}

/** Monthly recurring revenue from what is in force today. */
export async function revenueSummary() {
  const db = getDb();
  const today = clock.today();
  const subs = await db
    .select({ rent: schema.roomTypes.monthlyRent, mealPlan: schema.subscriptions.mealPlan, feePct: schema.hostels.platformFeePct })
    .from(schema.subscriptions)
    .innerJoin(schema.roomTypes, eq(schema.roomTypes.id, schema.subscriptions.roomTypeId))
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.subscriptions.hostelId))
    .where(eq(schema.subscriptions.status, 'active'));
  let subscriptionGross = 0;
  let platformFees = 0;
  for (const s of subs) {
    const gross = s.rent + FOOD_PLANS[s.mealPlan].price;
    subscriptionGross += gross;
    platformFees += Math.round((gross * s.feePct) / 100);
  }
  const plans = await db
    .select({ plan: schema.ownerPlans.plan, trialEndsOn: schema.ownerPlans.trialEndsOn })
    .from(schema.ownerPlans)
    .where(and(inArray(schema.ownerPlans.plan, ['pro', 'partner']), eq(schema.ownerPlans.suspended, false)));
  let ownerPlans = 0;
  let trialHostels = 0;
  for (const p of plans) {
    if (p.trialEndsOn && p.trialEndsOn >= today) trialHostels++;
    else ownerPlans += OWNER_PLANS[p.plan].price;
  }
  return { subscriptionGross, platformFees, ownerPlans, trialHostels };
}
