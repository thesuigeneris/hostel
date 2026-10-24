/**
 * Public trust numbers for hostels: rating summaries from published reviews and
 * issue-handling stats from the last 90 days. Used by public search/detail and owner/admin views.
 */
import { and, avg, count, eq, gte, inArray, sql } from 'drizzle-orm';
import type { IssueStats, RatingSummary } from '@hostels/shared';
import { db, schema, type DbOrTx } from '../db';

const round1 = (v: string | number | null) => (v === null ? null : Math.round(Number(v) * 10) / 10);

export async function ratingSummaries(hostelIds: string[], tx: DbOrTx = db): Promise<Map<string, RatingSummary>> {
  const out = new Map<string, RatingSummary>();
  if (hostelIds.length === 0) return out;
  const r = schema.reviews;
  const rows = await tx
    .select({
      hostelId: r.hostelId,
      count: count(),
      overall: avg(r.overall),
      food: avg(r.food),
      cleanliness: avg(r.cleanliness),
      safety: avg(r.safety),
      value: avg(r.value),
      staff: avg(r.staff),
    })
    .from(r)
    .where(and(inArray(r.hostelId, hostelIds), eq(r.status, 'published')))
    .groupBy(r.hostelId);
  for (const id of hostelIds) out.set(id, { count: 0, overall: null, food: null, cleanliness: null, safety: null, value: null, staff: null });
  for (const row of rows) {
    out.set(row.hostelId, {
      count: row.count,
      overall: round1(row.overall),
      food: round1(row.food),
      cleanliness: round1(row.cleanliness),
      safety: round1(row.safety),
      value: round1(row.value),
      staff: round1(row.staff),
    });
  }
  return out;
}

export async function ratingSummary(hostelId: string, tx: DbOrTx = db): Promise<RatingSummary> {
  return (await ratingSummaries([hostelId], tx)).get(hostelId)!;
}

export async function issueStats(hostelId: string, now = new Date(), tx: DbOrTx = db): Promise<IssueStats> {
  const i = schema.issues;
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const hoursExpr = (col: typeof i.resolvedAt) => sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${col} - ${i.createdAt})) / 3600)`;
  const [row] = await tx
    .select({
      total: count(),
      resolved: sql<number>`count(*) filter (where ${i.status} in ('resolved', 'closed'))`.mapWith(Number),
      medianResolution: hoursExpr(i.resolvedAt),
      medianResponse: hoursExpr(i.firstResponseAt),
    })
    .from(i)
    .where(and(eq(i.hostelId, hostelId), gte(i.createdAt, since)));
  const total = row?.total ?? 0;
  const resolved = row?.resolved ?? 0;
  return {
    last90Days: total,
    resolved,
    open: total - resolved,
    medianResolutionHours: row?.medianResolution === null || row?.medianResolution === undefined ? null : round1(row.medianResolution),
    medianResponseHours: row?.medianResponse === null || row?.medianResponse === undefined ? null : round1(row.medianResponse),
  };
}
