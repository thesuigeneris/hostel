import type { HostelSummary, SearchResult } from '@hostels/shared';
import type { searchSchema } from '@hostels/shared';
import { type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb } from '../db';

type Search = z.output<typeof searchSchema>;

/** Great-circle distance in km between a point and a hostel row (no PostGIS). */
function haversine(lat: number, lng: number): SQL {
  return sql`(6371 * 2 * asin(sqrt(
    power(sin(radians(h.lat - ${lat}) / 2), 2) +
    cos(radians(${lat})) * cos(radians(h.lat)) * power(sin(radians(h.lng - ${lng}) / 2), 2)
  )))`;
}

export async function searchHostels(q: Search): Promise<SearchResult> {
  const near = q.lat !== undefined && q.lng !== undefined;
  const distance = near ? haversine(q.lat!, q.lng!) : sql`null::float`;

  const where: SQL[] = [sql`h.status = 'live'`];
  if (q.area) where.push(sql`lower(h.area) = lower(${q.area})`);
  if (q.q) where.push(sql`(h.name ilike ${`%${q.q}%`} or h.area ilike ${`%${q.q}%`} or h.address ilike ${`%${q.q}%`})`);
  if (q.gender) where.push(sql`h.gender_type = ${q.gender}`);
  if (q.food) where.push(sql`h.food_available`);
  if (q.verified) where.push(sql`h.partner_status = 'verified' and not coalesce(p.suspended, false)`);
  if (q.minRating) where.push(sql`rv.rating >= ${q.minRating}`);
  if (near && q.radiusKm) where.push(sql`${distance} <= ${q.radiusKm}`);

  // Room filters narrow which rooms count toward the price shown, and drop hostels with none left.
  const roomWhere: SQL[] = [sql`true`];
  if (q.sharing) roomWhere.push(sql`r.sharing = ${q.sharing}`);
  if (q.minRent !== undefined) roomWhere.push(sql`r.monthly_rent >= ${q.minRent}`);
  if (q.maxRent !== undefined) roomWhere.push(sql`r.monthly_rent <= ${q.maxRent}`);
  const roomFiltered = q.sharing || q.minRent !== undefined || q.maxRent !== undefined;
  if (roomFiltered) where.push(sql`rm.room_count > 0`);

  const order = {
    recommended: sql`(h.partner_status = 'verified' and not coalesce(p.suspended, false)) desc, (rm.beds_free > 0) desc, rv.rating desc nulls last, h.name`,
    rent_asc: sql`rm.min_rent asc nulls last, h.name`,
    rent_desc: sql`rm.min_rent desc nulls last, h.name`,
    distance: near ? sql`${distance} asc` : sql`h.name`,
    rating: sql`rv.rating desc nulls last, rv.review_count desc, h.name`,
  }[q.sort];

  const offset = (q.page - 1) * q.limit;
  const rows = (await getDb().execute(sql`
    with rm as (
      select r.hostel_id, min(r.monthly_rent) as min_rent, sum(r.beds_available)::int as beds_free,
             count(*)::int as room_count, array_agg(distinct r.sharing::text) as sharing_types
      from room_types r where ${sql.join(roomWhere, sql` and `)} group by r.hostel_id
    ), rv as (
      select hostel_id, round(avg(rating)::numeric, 1)::float as rating, count(*)::int as review_count
      from reviews where not hidden group by hostel_id
    ), ph as (
      select distinct on (hostel_id) hostel_id, url from hostel_photos order by hostel_id, sort_order
    )
    select h.id, h.slug, h.name, h.city, h.area, h.lat, h.lng, h.gender_type, h.food_available,
           (h.partner_status = 'verified' and not coalesce(p.suspended, false)) as is_verified,
           ph.url as cover, rm.min_rent, coalesce(rm.beds_free, 0) as beds_free, coalesce(rm.sharing_types, '{}') as sharing_types,
           rv.rating, coalesce(rv.review_count, 0) as review_count, ${distance} as distance_km,
           count(*) over () as total
    from hostels h
    left join rm on rm.hostel_id = h.id
    left join rv on rv.hostel_id = h.id
    left join ph on ph.hostel_id = h.id
    left join owner_plans p on p.hostel_id = h.id
    where ${sql.join(where, sql` and `)}
    order by ${order}
    limit ${q.limit} offset ${offset}
  `)) as unknown as Record<string, unknown>[];

  const items: HostelSummary[] = rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    city: r.city as string,
    area: r.area as string,
    lat: Number(r.lat),
    lng: Number(r.lng),
    genderType: r.gender_type as HostelSummary['genderType'],
    foodAvailable: r.food_available as boolean,
    isVerified: r.is_verified as boolean,
    coverPhotoUrl: (r.cover as string | null) ?? null,
    minRent: r.min_rent === null ? null : Number(r.min_rent),
    bedsAvailable: Number(r.beds_free),
    sharingTypes: r.sharing_types as HostelSummary['sharingTypes'],
    rating: r.rating === null ? null : Number(r.rating),
    reviewCount: Number(r.review_count),
    ...(near ? { distanceKm: Math.round(Number(r.distance_km) * 10) / 10 } : {}),
  }));
  return { items, total: rows.length ? Number(rows[0]!.total) : 0, page: q.page, limit: q.limit };
}
