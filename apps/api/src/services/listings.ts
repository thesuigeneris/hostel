import type {
  HostelDetail,
  HostelUpdateInput,
  RatingBreakdown,
  RoomTypeUpdateInput,
  TransparencyStats,
  User,
} from '@hostels/shared';
import {
  addDays,
  type hostelInputSchema,
  newId,
  type roomTypeInputSchema,
  TRANSPARENCY_MIN_ISSUES,
  TRANSPARENCY_WINDOW_DAYS,
} from '@hostels/shared';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError, notFound } from '../lib/errors';
import { isBookable, ownedHostel, planFor } from './access';
import { toHostel, toRoomType } from './mappers';
import { switchPlan } from './plans';

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniqueSlug(name: string, area: string): Promise<string> {
  const base = slugify(name.toLowerCase().includes(area.toLowerCase()) ? name : `${name} ${area}`) || 'hostel';
  const db = getDb();
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [taken] = await db.select({ id: schema.hostels.id }).from(schema.hostels).where(eq(schema.hostels.slug, slug));
    if (!taken) return slug;
  }
  return `${base}-${newId('hst').slice(4, 10)}`;
}

export async function createHostel(owner: User, input: z.output<typeof hostelInputSchema>) {
  const db = getDb();
  const id = newId('hst');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const slug = await uniqueSlug(input.name, input.area);
      const [row] = await db.transaction(async (tx) => {
        const created = await tx
          .insert(schema.hostels)
          .values({ ...input, whatsappPhone: input.whatsappPhone ?? null, id, ownerId: owner.id, slug, status: 'draft' })
          .returning();
        await tx.insert(schema.ownerPlans).values({ id: newId('opl'), hostelId: id, plan: 'free', startDate: clock.today() });
        return created;
      });
      return toHostel(row!);
    } catch (e) {
      if (!isUniqueViolation(e, 'hostels_slug_unique')) throw e;
    }
  }
  throw new AppError('invalid_state', 'Could not pick a unique link for this hostel; try a different name');
}

/** Editing keeps a live listing live; a rejected one goes back to draft so it can be resubmitted. */
export async function updateHostel(user: User, hostelId: string, patch: HostelUpdateInput) {
  const h = await ownedHostel(user, hostelId);
  const [row] = await getDb()
    .update(schema.hostels)
    .set({ ...patch, ...(h.status === 'rejected' ? { status: 'draft' as const, rejectionReason: null } : {}) })
    .where(eq(schema.hostels.id, h.id))
    .returning();
  return toHostel(row!);
}

export async function submitHostel(user: User, hostelId: string) {
  const h = await ownedHostel(user, hostelId);
  if (h.status !== 'draft' && h.status !== 'rejected') {
    throw new AppError('invalid_state', h.status === 'live' ? 'This listing is already live' : 'This listing is already in review');
  }
  const db = getDb();
  const [rooms] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.roomTypes).where(eq(schema.roomTypes.hostelId, h.id));
  const [photos] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, h.id));
  const missing = [rooms!.n === 0 && 'at least one room type', photos!.n === 0 && 'at least one photo'].filter(Boolean);
  if (missing.length) throw new AppError('invalid_state', `Add ${missing.join(' and ')} before submitting`);
  const [row] = await db
    .update(schema.hostels)
    .set({ status: 'pending', rejectionReason: null })
    .where(eq(schema.hostels.id, h.id))
    .returning();
  return toHostel(row!);
}

export async function reviewListing(hostelId: string, decision: { approve: true } | { approve: false; reason: string }) {
  const db = getDb();
  const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  if (!h) throw notFound('Hostel');
  if (h.status !== 'pending') throw new AppError('invalid_state', 'Only listings in review can be approved or rejected');
  const [row] = await db
    .update(schema.hostels)
    .set(decision.approve ? { status: 'live', rejectionReason: null } : { status: 'rejected', rejectionReason: decision.reason })
    .where(eq(schema.hostels.id, hostelId))
    .returning();
  return toHostel(row!);
}

// --- rooms -----------------------------------------------------------------

export async function addRoomType(user: User, hostelId: string, input: z.output<typeof roomTypeInputSchema>) {
  const h = await ownedHostel(user, hostelId);
  const [row] = await getDb()
    .insert(schema.roomTypes)
    .values({ ...input, id: newId('rmt'), hostelId: h.id, advanceAmount: h.partnerStatus === 'verified' ? 0 : input.advanceAmount })
    .returning();
  return toRoomType(row!);
}

async function ownedRoom(user: User, roomTypeId: string) {
  const db = getDb();
  const [room] = await db.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, roomTypeId));
  if (!room) throw notFound('Room type');
  const hostel = await ownedHostel(user, room.hostelId);
  return { room, hostel };
}

export async function updateRoomType(user: User, roomTypeId: string, patch: RoomTypeUpdateInput) {
  const { room, hostel } = await ownedRoom(user, roomTypeId);
  const next = { ...room, ...patch } as typeof room;
  if (next.bedsAvailable > next.totalBeds) {
    throw new AppError('validation', 'Beds free cannot exceed total beds', 400, [{ path: 'bedsAvailable', message: 'Too many' }]);
  }
  if (hostel.partnerStatus === 'verified') next.advanceAmount = 0;
  const [row] = await getDb()
    .update(schema.roomTypes)
    .set({
      sharing: next.sharing,
      monthlyRent: next.monthlyRent,
      advanceAmount: next.advanceAmount,
      totalBeds: next.totalBeds,
      bedsAvailable: next.bedsAvailable,
    })
    .where(eq(schema.roomTypes.id, room.id))
    .returning();
  return toRoomType(row!);
}

export async function deleteRoomType(user: User, roomTypeId: string) {
  const { room } = await ownedRoom(user, roomTypeId);
  const db = getDb();
  const [used] = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.roomTypeId, room.id))
    .limit(1);
  const [moving] = await db
    .select({ id: schema.moveRequests.id })
    .from(schema.moveRequests)
    .where(or(eq(schema.moveRequests.fromRoomTypeId, room.id), eq(schema.moveRequests.toRoomTypeId, room.id)))
    .limit(1);
  if (used || moving) throw new AppError('invalid_state', 'This room type has subscriptions; set beds free to 0 instead');
  await db.delete(schema.roomTypes).where(eq(schema.roomTypes.id, room.id));
}

// --- photos ----------------------------------------------------------------

export async function addPhoto(user: User, hostelId: string, url: string) {
  const h = await ownedHostel(user, hostelId);
  const db = getDb();
  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${schema.hostelPhotos.sortOrder}), -1)::int` })
    .from(schema.hostelPhotos)
    .where(eq(schema.hostelPhotos.hostelId, h.id));
  const [row] = await db
    .insert(schema.hostelPhotos)
    .values({ id: newId('pho'), hostelId: h.id, url, sortOrder: max!.n + 1 })
    .returning();
  return row!;
}

export async function deletePhoto(user: User, hostelId: string, photoId: string) {
  const h = await ownedHostel(user, hostelId);
  const deleted = await getDb()
    .delete(schema.hostelPhotos)
    .where(and(eq(schema.hostelPhotos.id, photoId), eq(schema.hostelPhotos.hostelId, h.id)))
    .returning();
  if (!deleted.length) throw notFound('Photo');
}

export async function reorderPhotos(user: User, hostelId: string, photoIds: string[]) {
  const h = await ownedHostel(user, hostelId);
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [i, id] of photoIds.entries()) {
      await tx
        .update(schema.hostelPhotos)
        .set({ sortOrder: i })
        .where(and(eq(schema.hostelPhotos.id, id), eq(schema.hostelPhotos.hostelId, h.id)));
    }
  });
  return db.select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, h.id)).orderBy(asc(schema.hostelPhotos.sortOrder));
}

// --- partner flow ----------------------------------------------------------

export async function applyForPartner(user: User, hostelId: string) {
  const h = await ownedHostel(user, hostelId);
  if (h.status !== 'live') throw new AppError('invalid_state', 'The listing must be live before applying');
  if (h.partnerStatus === 'verified') throw new AppError('invalid_state', 'This hostel is already a verified partner');
  if (h.partnerStatus === 'applied') throw new AppError('invalid_state', 'Your application is already in review');
  const db = getDb();
  await db.update(schema.ownerPlans).set({ pendingPlan: 'partner', pendingPlanOn: null }).where(eq(schema.ownerPlans.hostelId, h.id));
  const [row] = await db
    .update(schema.hostels)
    .set({ partnerStatus: 'applied', rejectionReason: null })
    .where(eq(schema.hostels.id, h.id))
    .returning();
  return toHostel(row!);
}

/** Verifying a partner switches the owner plan to Partner, with the first month free if no trial was used. */
export async function decidePartner(hostelId: string, decision: { verify: true; platformFeePct: number } | { verify: false; reason: string }) {
  const db = getDb();
  const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  if (!h) throw notFound('Hostel');
  if (h.partnerStatus !== 'applied') throw new AppError('invalid_state', 'This hostel has no partner application in review');
  return db.transaction(async (tx) => {
    if (!decision.verify) {
      await tx.update(schema.ownerPlans).set({ pendingPlan: null, pendingPlanOn: null }).where(eq(schema.ownerPlans.hostelId, hostelId));
      const [row] = await tx
        .update(schema.hostels)
        .set({ partnerStatus: 'rejected', rejectionReason: decision.reason })
        .where(eq(schema.hostels.id, hostelId))
        .returning();
      return toHostel(row!);
    }
    await switchPlan(tx, hostelId, 'partner');
    await tx.update(schema.roomTypes).set({ advanceAmount: 0 }).where(eq(schema.roomTypes.hostelId, hostelId));
    const [row] = await tx
      .update(schema.hostels)
      .set({ partnerStatus: 'verified', platformFeePct: decision.platformFeePct, rejectionReason: null })
      .where(eq(schema.hostels.id, hostelId))
      .returning();
    return toHostel(row!);
  });
}

export async function setPlatformFee(hostelId: string, platformFeePct: number) {
  const [row] = await getDb().update(schema.hostels).set({ platformFeePct }).where(eq(schema.hostels.id, hostelId)).returning();
  if (!row) throw notFound('Hostel');
  return toHostel(row);
}

// --- reading ---------------------------------------------------------------

export async function ratingsFor(hostelId: string): Promise<RatingBreakdown> {
  const r = schema.reviews;
  const [row] = await getDb()
    .select({
      rating: sql<number | null>`round(avg(${r.rating})::numeric, 1)::float`,
      reviewCount: sql<number>`count(*)::int`,
      cleanliness: sql<number | null>`round(avg(${r.cleanliness})::numeric, 1)::float`,
      food: sql<number | null>`round(avg(${r.food})::numeric, 1)::float`,
      safety: sql<number | null>`round(avg(${r.safety})::numeric, 1)::float`,
      responsiveness: sql<number | null>`round(avg(${r.responsiveness})::numeric, 1)::float`,
    })
    .from(r)
    .where(and(eq(r.hostelId, hostelId), eq(r.hidden, false)));
  return row!;
}

export async function transparencyFor(hostelId: string): Promise<TransparencyStats | null> {
  const since = addDays(clock.today(), -TRANSPARENCY_WINDOW_DAYS);
  const i = schema.issues;
  const [row] = await getDb()
    .select({
      reported: sql<number>`count(*)::int`,
      resolved: sql<number>`count(*) filter (where ${i.status} in ('resolved', 'closed'))::int`,
      firstResponse: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${i.acknowledgedAt} - ${i.createdAt})) / 3600)`,
      toResolve: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${i.resolvedAt} - ${i.createdAt})) / 3600)`,
    })
    .from(i)
    .where(and(eq(i.hostelId, hostelId), sql`${i.createdAt} >= ${since}::date`));
  if (!row || row.reported < TRANSPARENCY_MIN_ISSUES) return null;
  const round = (v: number | null) => (v === null ? null : Math.round(Number(v) * 10) / 10);
  return {
    windowDays: TRANSPARENCY_WINDOW_DAYS,
    reported: row.reported,
    resolvedPct: Math.round((row.resolved / row.reported) * 100),
    medianHoursToFirstResponse: round(row.firstResponse),
    medianHoursToResolve: round(row.toResolve),
  };
}

export async function hostelDetail(hostel: typeof schema.hostels.$inferSelect): Promise<HostelDetail> {
  const db = getDb();
  const [photos, rooms, ratings, transparency, plan] = await Promise.all([
    db.select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, hostel.id)).orderBy(asc(schema.hostelPhotos.sortOrder)),
    db.select().from(schema.roomTypes).where(eq(schema.roomTypes.hostelId, hostel.id)).orderBy(asc(schema.roomTypes.monthlyRent)),
    ratingsFor(hostel.id),
    transparencyFor(hostel.id),
    planFor(hostel.id),
  ]);
  return {
    ...toHostel(hostel),
    isVerified: isBookable(hostel, plan),
    photos,
    roomTypes: rooms.map(toRoomType),
    ratings,
    transparency,
  };
}

export async function publicHostelBySlug(slug: string) {
  const [h] = await getDb()
    .select()
    .from(schema.hostels)
    .where(and(eq(schema.hostels.slug, slug), eq(schema.hostels.status, 'live')));
  if (!h) throw notFound('Hostel');
  return hostelDetail(h);
}

export async function ownerHostelDetail(user: User, hostelId: string) {
  const h = await ownedHostel(user, hostelId);
  const [detail, plan] = await Promise.all([hostelDetail(h), planFor(h.id)]);
  return { ...detail, plan };
}

export async function listAreas() {
  const rows = await getDb()
    .select({ area: schema.hostels.area, count: sql<number>`count(*)::int` })
    .from(schema.hostels)
    .where(eq(schema.hostels.status, 'live'))
    .groupBy(schema.hostels.area)
    .orderBy(asc(schema.hostels.area));
  return rows.map((r) => ({ ...r, slug: slugify(r.area) }));
}

export async function liveSlugs() {
  return getDb()
    .select({ slug: schema.hostels.slug, area: schema.hostels.area })
    .from(schema.hostels)
    .where(eq(schema.hostels.status, 'live'));
}

