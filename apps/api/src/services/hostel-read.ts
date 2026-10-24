/** Read models for hostels shown to seekers: summaries (cards) and full detail pages. */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HostelDetail, HostelSummary, SharingType } from '@hostels/shared';
import { SHARING_TYPES } from '@hostels/shared';
import { db, schema, type DbOrTx } from '../db';
import { toHostel, toPhoto, toRoomType } from '../lib/serialize';
import { issueStats, ratingSummaries, ratingSummary } from './reputation';

type HostelRow = typeof schema.hostels.$inferSelect;

export function slugifyArea(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Build card summaries for hostels, preserving input order. */
export async function hostelSummaries(hostels: HostelRow[], distances?: Map<string, number>, tx: DbOrTx = db): Promise<HostelSummary[]> {
  if (hostels.length === 0) return [];
  const ids = hostels.map((h) => h.id);
  const [rooms, photos, ratings] = await Promise.all([
    tx.select().from(schema.roomTypes).where(inArray(schema.roomTypes.hostelId, ids)),
    tx.select().from(schema.hostelPhotos).where(inArray(schema.hostelPhotos.hostelId, ids)).orderBy(asc(schema.hostelPhotos.sortOrder)),
    ratingSummaries(ids, tx),
  ]);
  return hostels.map((h) => {
    const rs = rooms.filter((r) => r.hostelId === h.id);
    const cover = photos.find((p) => p.hostelId === h.id);
    const sharing = new Set(rs.map((r) => r.sharing));
    const rating = ratings.get(h.id)!;
    const d = distances?.get(h.id);
    return {
      id: h.id,
      slug: h.slug,
      name: h.name,
      city: h.city,
      area: h.area,
      lat: h.lat,
      lng: h.lng,
      genderType: h.genderType,
      foodAvailable: h.foodAvailable,
      partnerStatus: h.partnerStatus,
      ownerPlan: h.ownerPlan,
      coverPhotoUrl: cover?.url ?? null,
      minRent: rs.length ? Math.min(...rs.map((r) => r.monthlyRent)) : null,
      sharingTypes: SHARING_TYPES.filter((s): s is SharingType => sharing.has(s)),
      bedsAvailable: rs.reduce((n, r) => n + r.bedsAvailable, 0),
      rating: rating.overall,
      reviewCount: rating.count,
      ...(d !== undefined ? { distanceKm: Math.round(d * 10) / 10 } : {}),
    };
  });
}

export async function hostelSummaryById(id: string, tx: DbOrTx = db): Promise<HostelSummary | null> {
  const [h] = await tx.select().from(schema.hostels).where(eq(schema.hostels.id, id));
  if (!h) return null;
  return (await hostelSummaries([h], undefined, tx))[0]!;
}

export async function hostelDetail(h: HostelRow, tx: DbOrTx = db): Promise<HostelDetail> {
  const [photos, rooms, rating, stats] = await Promise.all([
    tx.select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, h.id)).orderBy(asc(schema.hostelPhotos.sortOrder)),
    tx.select().from(schema.roomTypes).where(eq(schema.roomTypes.hostelId, h.id)).orderBy(asc(schema.roomTypes.monthlyRent)),
    ratingSummary(h.id, tx),
    issueStats(h.id, new Date(), tx),
  ]);
  return { ...toHostel(h), photos: photos.map(toPhoto), roomTypes: rooms.map(toRoomType), rating, issueStats: stats };
}

export async function liveHostelBySlug(slug: string, tx: DbOrTx = db): Promise<HostelRow | null> {
  const [h] = await tx
    .select()
    .from(schema.hostels)
    .where(and(eq(schema.hostels.slug, slug), eq(schema.hostels.status, 'live')));
  return h ?? null;
}
