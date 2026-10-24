/** Builds `HostelSummary` DTOs for owner dashboards and community pages. */
import { asc, inArray } from 'drizzle-orm';
import type { HostelSummary } from '@hostels/shared';
import { db, schema, type DbOrTx } from '../db';
import { ratingSummaries } from './reputation';
import type { HostelRow } from './owner-access';

export async function hostelSummaries(hostels: HostelRow[], tx: DbOrTx = db): Promise<Map<string, HostelSummary>> {
  const out = new Map<string, HostelSummary>();
  if (hostels.length === 0) return out;
  const ids = hostels.map((h) => h.id);
  const [rooms, photos, ratings] = await Promise.all([
    tx.select().from(schema.roomTypes).where(inArray(schema.roomTypes.hostelId, ids)),
    tx.select().from(schema.hostelPhotos).where(inArray(schema.hostelPhotos.hostelId, ids)).orderBy(asc(schema.hostelPhotos.sortOrder)),
    ratingSummaries(ids, tx),
  ]);
  for (const h of hostels) {
    const rs = rooms.filter((r) => r.hostelId === h.id);
    const cover = photos.find((p) => p.hostelId === h.id);
    const rating = ratings.get(h.id)!;
    out.set(h.id, {
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
      sharingTypes: [...new Set(rs.map((r) => r.sharing))],
      bedsAvailable: rs.reduce((a, r) => a + r.bedsAvailable, 0),
      rating: rating.overall,
      reviewCount: rating.count,
    });
  }
  return out;
}

export async function hostelSummary(h: HostelRow, tx: DbOrTx = db): Promise<HostelSummary> {
  return (await hostelSummaries([h], tx)).get(h.id)!;
}
