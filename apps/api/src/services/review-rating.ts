import { type SQL, sql } from 'drizzle-orm';

/**
 * A review counts toward a hostel's rating only when the stay is corroborated.
 * Owner-added residents need at least one rent record; platform subscribers always count.
 */
export function countsTowardRating(reviewTable: string): SQL {
  return sql.raw(
    `exists (select 1 from residencies rs where rs.id = ${reviewTable}.residency_id` +
      ` and (rs.source <> 'owner' or exists (select 1 from rent_records rr where rr.residency_id = rs.id)))`,
  );
}
