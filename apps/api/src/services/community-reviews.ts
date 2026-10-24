/** Verified-resident reviews, owner replies, admin moderation. See personas addendum §3. */
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { newId, type Paginated, type Review, type ReviewStatus, type schemas } from '@hostels/shared';
import type { z } from 'zod';
import { db, schema } from '../db';
import { err, pageParams } from '../lib/http';
import { hostelRef, toReview } from '../lib/serialize-community';
import type { UserRow } from '../lib/types';
import { getHostel, reviewableResidency } from './community-access';
import type { HostelRow } from './owner-access';

type ReviewRow = typeof schema.reviews.$inferSelect;
type ReviewInput = z.output<typeof schemas.reviewInput>;

/** Attach author and stay dates to review rows. */
export async function decorateReviews(rows: ReviewRow[]): Promise<Review[]> {
  if (rows.length === 0) return [];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const resIds = [...new Set(rows.map((r) => r.residencyId).filter((x): x is string => !!x))];
  const [users, stays] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, userIds)),
    resIds.length
      ? db
          .select({ id: schema.residencies.id, startDate: schema.residencies.startDate, endDate: schema.residencies.endDate })
          .from(schema.residencies)
          .where(inArray(schema.residencies.id, resIds))
      : Promise.resolve([]),
  ]);
  const u = new Map(users.map((x) => [x.id, x]));
  const s = new Map(stays.map((x) => [x.id, x]));
  return rows.map((r) => toReview(r, u.get(r.userId)!, r.residencyId ? (s.get(r.residencyId) ?? null) : null));
}

function scores(hostel: HostelRow, input: ReviewInput) {
  if (hostel.foodAvailable && (input.food === null || input.food === undefined)) {
    throw err.validation('Rate the food too', [{ path: 'food', message: 'Required for hostels that serve food' }]);
  }
  return {
    overall: input.overall,
    food: hostel.foodAvailable ? input.food! : null,
    cleanliness: input.cleanliness,
    safety: input.safety,
    value: input.value,
    staff: input.staff,
    title: input.title,
    body: input.body,
  };
}

export async function writeReview(user: UserRow, hostelId: string, input: ReviewInput): Promise<Review> {
  const hostel = await getHostel(hostelId);
  const residency = await reviewableResidency(user.id, hostelId);
  if (!residency) throw err.domain('not_resident', 'Only people who live or have lived here can review this hostel', 403);
  const [existing] = await db
    .select({ id: schema.reviews.id })
    .from(schema.reviews)
    .where(and(eq(schema.reviews.userId, user.id), eq(schema.reviews.hostelId, hostelId)));
  if (existing) throw err.conflict('already_reviewed', 'You have already reviewed this hostel. Edit your review instead.');
  const [r] = await db
    .insert(schema.reviews)
    .values({ id: newId('rev'), hostelId, userId: user.id, residencyId: residency.id, ...scores(hostel, input) })
    .returning();
  return (await decorateReviews([r!]))[0]!;
}

export async function editReview(user: UserRow, reviewId: string, input: ReviewInput): Promise<Review> {
  const [r] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, reviewId));
  if (!r || r.userId !== user.id) throw err.notFound('Review');
  const hostel = await getHostel(r.hostelId);
  const [u] = await db
    .update(schema.reviews)
    .set({ ...scores(hostel, input), updatedAt: new Date() })
    .where(eq(schema.reviews.id, reviewId))
    .returning();
  return (await decorateReviews([u!]))[0]!;
}

export async function myReviews(user: UserRow): Promise<Review[]> {
  const rows = await db.select().from(schema.reviews).where(eq(schema.reviews.userId, user.id)).orderBy(desc(schema.reviews.createdAt));
  return decorateReviews(rows);
}

/** Owner view of all reviews for a hostel, hidden ones included. */
export async function hostelReviewsForOwner(hostelId: string): Promise<Review[]> {
  const rows = await db.select().from(schema.reviews).where(eq(schema.reviews.hostelId, hostelId)).orderBy(desc(schema.reviews.createdAt));
  return decorateReviews(rows);
}

export async function replyToReview(reviewId: string, reply: string, assertOwner: (hostelId: string) => Promise<unknown>): Promise<Review> {
  const [r] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, reviewId));
  if (!r) throw err.notFound('Review');
  await assertOwner(r.hostelId);
  const [u] = await db.update(schema.reviews).set({ ownerReply: reply, ownerRepliedAt: new Date() }).where(eq(schema.reviews.id, reviewId)).returning();
  return (await decorateReviews([u!]))[0]!;
}

export async function adminReviews(q: { status?: ReviewStatus; page?: number }) {
  const pg = pageParams(q.page);
  const where: SQL | undefined = q.status ? eq(schema.reviews.status, q.status) : undefined;
  const [[total], rows] = await Promise.all([
    db.select({ n: count() }).from(schema.reviews).where(where),
    db.select().from(schema.reviews).where(where).orderBy(desc(schema.reviews.createdAt)).limit(pg.pageSize).offset(pg.offset),
  ]);
  const items = await decorateReviews(rows);
  const hostelIds = [...new Set(rows.map((r) => r.hostelId))];
  const hostels = hostelIds.length ? await db.select().from(schema.hostels).where(inArray(schema.hostels.id, hostelIds)) : [];
  const byId = new Map(hostels.map((h) => [h.id, hostelRef(h)]));
  return { items: items.map((i) => ({ ...i, hostel: byId.get(i.hostelId)! })), total: total!.n, page: pg.page, pageSize: pg.pageSize } satisfies Paginated<unknown>;
}

export async function moderateReview(reviewId: string, status: ReviewStatus): Promise<Review> {
  const [u] = await db.update(schema.reviews).set({ status }).where(eq(schema.reviews.id, reviewId)).returning();
  if (!u) throw err.notFound('Review');
  return (await decorateReviews([u]))[0]!;
}
