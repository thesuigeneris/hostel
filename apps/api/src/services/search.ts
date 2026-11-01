import type { HostelSummary, SearchResult, Suggestion, Suggestions } from '@hostels/shared';
import { RATING_MIN_REVIEWS, RATING_PRIOR_WEIGHT, SUGGEST_MAX_AREAS, type searchSchema, type suggestSchema } from '@hostels/shared';
import { type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb } from '../db';
import { slugify } from './listings';

type Search = z.output<typeof searchSchema>;

/** Great-circle distance in km between a point and a hostel row (no PostGIS). */
function haversine(lat: number, lng: number): SQL {
  return sql`(6371 * 2 * asin(sqrt(
    power(sin(radians(h.lat - ${lat}) / 2), 2) +
    cos(radians(${lat})) * cos(radians(h.lat)) * power(sin(radians(h.lng - ${lng}) / 2), 2)
  )))`;
}

/** Typed text matched literally inside ILIKE: `%` and `_` are characters to find, not wildcards. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
const contains = (text: string) => `%${escapeLike(text)}%`;
const startsWith = (text: string) => `${escapeLike(text)}%`;

// Live hostels and the numbers search needs: the cheapest matching room, beds free, ratings and the cover photo.
// `prior` is the mean of every visible review, the anchor for the shrunk average that ranks by rating.
function ctes(roomWhere: SQL[]) {
  return sql`
    with rm as (
      select r.hostel_id, min(r.monthly_rent) as min_rent, sum(r.beds_available)::int as beds_free,
             count(*)::int as room_count, array_agg(distinct r.sharing::text) as sharing_types
      from room_types r where ${sql.join(roomWhere, sql` and `)} group by r.hostel_id
    ), rv as (
      select hostel_id, round(avg(rating)::numeric, 1)::float as rating, count(*)::int as review_count, sum(rating)::float as rating_sum
      from reviews where not hidden group by hostel_id
    ), prior as (
      select coalesce(avg(r.rating)::float, 0) as mean
      from reviews r join hostels x on x.id = r.hostel_id and x.status = 'live' where not r.hidden
    ), ph as (
      select distinct on (hostel_id) hostel_id, url from hostel_photos order by hostel_id, sort_order
    )`;
}

export async function searchHostels(q: Search): Promise<SearchResult> {
  const near = q.lat !== undefined && q.lng !== undefined;
  const distance = near ? haversine(q.lat!, q.lng!) : sql`null::float`;
  const verified = sql`(h.partner_status = 'verified' and not coalesce(p.suspended, false))`;
  // Shrunk average: few reviews stay near the overall mean, so one 5★ review can't outrank fifty at 4.8.
  const score = sql`(case when rv.review_count > 0 then (${RATING_PRIOR_WEIGHT} * prior.mean + rv.rating_sum) / (${RATING_PRIOR_WEIGHT} + rv.review_count) end)`;

  const where: SQL[] = [sql`h.status = 'live'`];
  if (q.area) where.push(sql`lower(h.area) = lower(${q.area})`);
  if (q.q) {
    const text = contains(q.q);
    where.push(sql`(h.name ilike ${text} or h.area ilike ${text} or h.address ilike ${text})`);
  }
  if (q.gender) where.push(sql`h.gender_type = ${q.gender}`);
  if (q.food) where.push(sql`h.food_available`);
  if (q.verified) where.push(verified);
  // "Rated 4★ or higher" means a rating the page shows: below the review threshold a hostel reads "New".
  if (q.minRating) where.push(sql`rv.review_count >= ${RATING_MIN_REVIEWS} and rv.rating >= ${q.minRating}`);
  if (near && q.radiusKm) where.push(sql`${distance} <= ${q.radiusKm}`);

  // Room filters narrow which rooms count toward the price shown, and drop hostels with none left.
  const roomWhere: SQL[] = [sql`true`];
  if (q.sharing) roomWhere.push(sql`r.sharing = ${q.sharing}`);
  if (q.minRent !== undefined) roomWhere.push(sql`r.monthly_rent >= ${q.minRent}`);
  if (q.maxRent !== undefined) roomWhere.push(sql`r.monthly_rent <= ${q.maxRent}`);
  const roomFiltered = q.sharing || q.minRent !== undefined || q.maxRent !== undefined;
  if (roomFiltered) where.push(sql`rm.room_count > 0`);

  // Every order ends with the id, so equal rows keep one order and paging never repeats or skips a hostel.
  const order = {
    recommended: sql`${verified} desc, (rm.beds_free > 0) desc, ${score} desc nulls last, h.name, h.id`,
    rent_asc: sql`rm.min_rent asc nulls last, h.name, h.id`,
    rent_desc: sql`rm.min_rent desc nulls last, h.name, h.id`,
    distance: near ? sql`${distance} asc, h.name, h.id` : sql`h.name, h.id`,
    rating: sql`${score} desc nulls last, rv.review_count desc nulls last, h.name, h.id`,
  }[q.sort];

  const from = sql`
    from hostels h
    left join rm on rm.hostel_id = h.id
    left join rv on rv.hostel_id = h.id
    left join ph on ph.hostel_id = h.id
    left join owner_plans p on p.hostel_id = h.id
    cross join prior
    where ${sql.join(where, sql` and `)}`;

  const db = getDb();
  const offset = (q.page - 1) * q.limit;
  const rows = (await db.execute(sql`
    ${ctes(roomWhere)}
    select h.id, h.slug, h.name, h.city, h.area, h.lat, h.lng, h.gender_type, h.food_available, ${verified} as is_verified,
           ph.url as cover, rm.min_rent, coalesce(rm.beds_free, 0) as beds_free, coalesce(rm.sharing_types, '{}') as sharing_types,
           rv.rating, coalesce(rv.review_count, 0) as review_count, ${distance} as distance_km
    ${from}
    order by ${order}
    limit ${q.limit} offset ${offset}
  `)) as unknown as Record<string, unknown>[];

  // The total is counted on its own, so a page past the end still reports how many hostels match.
  const total =
    offset === 0 && rows.length < q.limit
      ? rows.length
      : Number(((await db.execute(sql`${ctes(roomWhere)} select count(*)::int as total ${from}`)) as unknown as { total: number }[])[0]!.total);

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
  return { items, total, page: q.page, limit: q.limit };
}

/**
 * Suggestions while a seeker types: areas first (they lead to an area page), then hostel names. Areas match at the
 * start of a word ("hi" finds HiTech City, not Gachibowli). Names match anywhere, with matches at the start of the
 * name, then at the start of a word, ranked first.
 */
export async function suggest(input: z.output<typeof suggestSchema>): Promise<Suggestions> {
  const q = input.q.replace(/\s+/g, ' ');
  const text = contains(q);
  const rank = (col: SQL) =>
    sql`case when ${col} ilike ${startsWith(q)} then 0 when ${col} ilike ${contains(` ${q}`)} then 1 else 2 end`;
  const db = getDb();
  const [areas, hostels] = await Promise.all([
    db.execute(sql`
      select h.area, count(*)::int as count from hostels h
      where h.status = 'live' and (h.area ilike ${startsWith(q)} or h.area ilike ${contains(` ${q}`)})
      group by h.area
      order by min(${rank(sql`h.area`)}), count(*) desc, h.area
      limit ${Math.min(SUGGEST_MAX_AREAS, input.limit)}
    `) as unknown as Promise<{ area: string; count: number }[]>,
    db.execute(sql`
      select h.slug, h.name, h.area, (h.partner_status = 'verified' and not coalesce(p.suspended, false)) as is_verified
      from hostels h left join owner_plans p on p.hostel_id = h.id
      where h.status = 'live' and h.name ilike ${text}
      order by ${rank(sql`h.name`)}, is_verified desc, h.name, h.id
      limit ${input.limit}
    `) as unknown as Promise<{ slug: string; name: string; area: string; is_verified: boolean }[]>,
  ]);
  const items: Suggestion[] = [
    ...areas.map((a): Suggestion => ({ kind: 'area', label: a.area, slug: slugify(a.area), count: Number(a.count) })),
    ...hostels.map((h): Suggestion => ({ kind: 'hostel', label: h.name, slug: h.slug, area: h.area, isVerified: h.is_verified })),
  ];
  return { q, items: items.slice(0, input.limit) };
}
