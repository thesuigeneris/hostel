/** Public reads for hostel pages: menus, published reviews, public issues, areas, food partners, views. */
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AreaSummary, FoodPartner, Issue, MenuWeek, Paginated, Review } from '@hostels/shared';
import { istDate } from '@hostels/shared';
import { db, schema, type DbOrTx } from '../db';
import { pageParams } from '../lib/http';
import { iso, isoOrNull, toPublicUser } from '../lib/serialize';
import { slugifyArea } from './hostel-read';

export async function menuWeekFor(hostelId: string, weekStart: string, tx: DbOrTx = db): Promise<MenuWeek | null> {
  const [week] = await tx
    .select()
    .from(schema.menuWeeks)
    .where(and(eq(schema.menuWeeks.hostelId, hostelId), eq(schema.menuWeeks.weekStart, weekStart)));
  if (!week) return null;
  const items = await tx
    .select({ item: schema.menuItems, partner: schema.foodPartners })
    .from(schema.menuItems)
    .leftJoin(schema.foodPartners, eq(schema.foodPartners.id, schema.menuItems.foodPartnerId))
    .where(eq(schema.menuItems.menuWeekId, week.id))
    .orderBy(asc(schema.menuItems.date), sql`array_position(array['breakfast','lunch','dinner']::meal[], ${schema.menuItems.meal})`);
  return {
    id: week.id,
    hostelId: week.hostelId,
    weekStart: week.weekStart,
    theme: week.theme,
    items: items.map(({ item, partner }) => ({
      id: item.id,
      date: item.date,
      meal: item.meal,
      vegDish: item.vegDish,
      nonVegDish: item.nonVegDish,
      foodPartner: partner ? { id: partner.id, name: partner.name, logoUrl: partner.logoUrl } : null,
    })),
  };
}

export async function publishedReviews(hostelId: string, pageNo?: number): Promise<Paginated<Review>> {
  const { page, pageSize, offset } = pageParams(pageNo, undefined, 10);
  const r = schema.reviews;
  const where = and(eq(r.hostelId, hostelId), eq(r.status, 'published'));
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ review: r, author: { id: schema.users.id, name: schema.users.name }, residency: schema.residencies })
      .from(r)
      .innerJoin(schema.users, eq(schema.users.id, r.userId))
      .leftJoin(schema.residencies, eq(schema.residencies.id, r.residencyId))
      .where(where)
      .orderBy(desc(r.createdAt), asc(r.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(r).where(where),
  ]);
  return {
    items: rows.map(({ review, author, residency }) => ({
      id: review.id,
      hostelId: review.hostelId,
      author: toPublicUser(author),
      verifiedResident: true,
      stayedFrom: residency?.startDate ?? null,
      stayedTo: residency?.endDate ?? null,
      overall: review.overall,
      food: review.food,
      cleanliness: review.cleanliness,
      safety: review.safety,
      value: review.value,
      staff: review.staff,
      title: review.title,
      body: review.body,
      ownerReply: review.ownerReply,
      ownerRepliedAt: isoOrNull(review.ownerRepliedAt),
      status: review.status,
      createdAt: iso(review.createdAt),
    })),
    total,
    page,
    pageSize,
  };
}

/** Public transparency board: only `isPublic` issues, never with the reporter. */
export async function publicIssues(hostelId: string, viewerId: string | null, pageNo?: number): Promise<Paginated<Issue>> {
  const { page, pageSize, offset } = pageParams(pageNo, undefined, 20);
  const i = schema.issues;
  const where = and(eq(i.hostelId, hostelId), eq(i.isPublic, true));
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(i).where(where).orderBy(desc(i.createdAt), asc(i.id)).limit(pageSize).offset(offset),
    db.select({ total: count() }).from(i).where(where),
  ]);
  const ids = rows.map((r) => r.id);
  const votes = ids.length
    ? await db
        .select({ issueId: schema.issueUpvotes.issueId, n: count(), mine: sql<boolean>`bool_or(${schema.issueUpvotes.userId} = ${viewerId ?? ''})` })
        .from(schema.issueUpvotes)
        .where(inArray(schema.issueUpvotes.issueId, ids))
        .groupBy(schema.issueUpvotes.issueId)
    : [];
  const byId = new Map(votes.map((v) => [v.issueId, v]));
  return {
    items: rows.map((r) => ({
      id: r.id,
      hostelId: r.hostelId,
      reporter: null,
      anonymous: r.anonymous,
      isPublic: r.isPublic,
      category: r.category,
      severity: r.severity,
      title: r.title,
      description: r.description,
      photoUrls: r.photoUrls,
      status: r.status,
      upvotes: byId.get(r.id)?.n ?? 0,
      upvotedByMe: !!byId.get(r.id)?.mine,
      acknowledgedAt: isoOrNull(r.acknowledgedAt),
      resolvedAt: isoOrNull(r.resolvedAt),
      closedAt: isoOrNull(r.closedAt),
      createdAt: iso(r.createdAt),
    })),
    total,
    page,
    pageSize,
  };
}

export async function areas(): Promise<AreaSummary[]> {
  const h = schema.hostels;
  const rows = await db
    .select({
      city: h.city,
      area: h.area,
      hostelCount: sql<number>`count(distinct ${h.id})`.mapWith(Number),
      minRent: sql<number | null>`min(${schema.roomTypes.monthlyRent})`,
    })
    .from(h)
    .leftJoin(schema.roomTypes, eq(schema.roomTypes.hostelId, h.id))
    .where(eq(h.status, 'live'))
    .groupBy(h.city, h.area)
    .orderBy(asc(h.city), asc(h.area));
  return rows.map((r) => ({
    city: r.city,
    area: r.area,
    slug: slugifyArea(r.area),
    hostelCount: r.hostelCount,
    minRent: r.minRent === null ? null : Number(r.minRent),
  }));
}

export async function activeFoodPartners(): Promise<FoodPartner[]> {
  const rows = await db.select().from(schema.foodPartners).where(eq(schema.foodPartners.active, true)).orderBy(asc(schema.foodPartners.name));
  return rows.map((p) => ({ id: p.id, name: p.name, cuisine: p.cuisine, logoUrl: p.logoUrl, active: p.active }));
}

export async function recordView(hostelId: string, now = new Date()) {
  await db
    .insert(schema.hostelViews)
    .values({ hostelId, day: istDate(now), count: 1 })
    .onConflictDoUpdate({
      target: [schema.hostelViews.hostelId, schema.hostelViews.day],
      set: { count: sql`${schema.hostelViews.count} + 1` },
    });
}
