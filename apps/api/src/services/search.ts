/** Public hostel search: filters, haversine distance, ranking and pagination. */
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { HostelSearchQuery, HostelSummary, Paginated } from '@hostels/shared';
import { db, schema } from '../db';
import { pageParams } from '../lib/http';
import { hostelSummaries } from './hostel-read';

const h = schema.hostels;

/** Great-circle distance in km from (lat, lng) to the hostel. */
function distanceExpr(lat: number, lng: number): SQL<number> {
  return sql<number>`(6371 * 2 * asin(sqrt(
    power(sin(radians(${h.lat} - ${lat}) / 2), 2) +
    cos(radians(${lat})) * cos(radians(${h.lat})) * power(sin(radians(${h.lng} - ${lng}) / 2), 2)
  )))`;
}

const minRentExpr = sql<number | null>`(select min(r.monthly_rent) from room_types r where r.hostel_id = ${h.id})`;
const ratingExpr = sql<number | null>`(select avg(rv.overall) from reviews rv where rv.hostel_id = ${h.id} and rv.status = 'published')`;

export async function searchHostels(q: HostelSearchQuery): Promise<Paginated<HostelSummary>> {
  const { page, pageSize, offset } = pageParams(q.page, q.pageSize);
  const conds: SQL[] = [eq(h.status, 'live')];
  if (q.city) conds.push(ilike(h.city, q.city));
  if (q.area) {
    // Accept either the area name or its slug ("hitec-city").
    conds.push(or(ilike(h.area, q.area), sql`regexp_replace(lower(${h.area}), '[^a-z0-9]+', '-', 'g') = ${q.area.toLowerCase()}`)!);
  }
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, '')}%`;
    conds.push(or(ilike(h.name, like), ilike(h.area, like), ilike(h.city, like), ilike(h.description, like))!);
  }
  if (q.gender) conds.push(eq(h.genderType, q.gender));
  if (q.food) conds.push(eq(h.foodAvailable, true));
  if (q.verified) conds.push(eq(h.partnerStatus, 'verified'));
  if (q.sharing || q.minRent !== undefined || q.maxRent !== undefined) {
    const roomConds: SQL[] = [sql`r.hostel_id = ${h.id}`];
    if (q.sharing) roomConds.push(sql`r.sharing = ${q.sharing}`);
    if (q.minRent !== undefined) roomConds.push(sql`r.monthly_rent >= ${q.minRent}`);
    if (q.maxRent !== undefined) roomConds.push(sql`r.monthly_rent <= ${q.maxRent}`);
    conds.push(sql`exists (select 1 from room_types r where ${sql.join(roomConds, sql` and `)})`);
  }
  const where = and(...conds);

  const hasPoint = q.lat !== undefined && q.lng !== undefined;
  const dist = hasPoint ? distanceExpr(q.lat!, q.lng!) : null;

  const recommended = [
    desc(sql`(${h.partnerStatus} = 'verified')`),
    desc(sql`(${h.ownerPlan} = 'pro')`),
    sql`${ratingExpr} desc nulls last`,
    desc(h.createdAt),
  ];
  let order: SQL[];
  switch (q.sort) {
    case 'price_asc':
      order = [sql`${minRentExpr} asc nulls last`, asc(h.name)];
      break;
    case 'price_desc':
      order = [sql`${minRentExpr} desc nulls last`, asc(h.name)];
      break;
    case 'rating':
      order = [sql`${ratingExpr} desc nulls last`, ...recommended];
      break;
    case 'distance':
      order = dist ? [asc(dist), ...recommended] : recommended;
      break;
    default:
      order = recommended;
  }

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ hostel: h, distance: dist ?? sql<null>`null` })
      .from(h)
      .where(where)
      .orderBy(...order, asc(h.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(h).where(where),
  ]);

  const distances = hasPoint ? new Map(rows.map((r) => [r.hostel.id, Number(r.distance)])) : undefined;
  const items = await hostelSummaries(
    rows.map((r) => r.hostel),
    distances,
  );
  return { items, total, page, pageSize };
}
