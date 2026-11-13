import type { User } from '@hostels/shared';
import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';

/**
 * In-app signals for residents (product gap 1b, spec docs/superpowers/specs/2026-11-13-resident-signals.md): an update
 * on an issue you reported, made by anyone but you (the hostel, our team, another resident, or the automatic close),
 * is unread until you next open the issue. No push messages: the counts show in the app and on the website.
 */

type IssueRow = Pick<typeof schema.issues.$inferSelect, 'id' | 'reporterId' | 'createdAt'>;

const u = schema.issueUpdates;
const r = schema.issueReads;
const i = schema.issues;

/** Updates by others, per issue, after the reporter last opened it (or after reporting it, if never opened). */
export async function unreadCounts(viewer: User, rows: IssueRow[]): Promise<Map<string, number>> {
  const mine = rows.filter((row) => row.reporterId === viewer.id).map((row) => row.id);
  const out = new Map<string, number>();
  if (!mine.length) return out;
  const counts = await getDb()
    .select({ issueId: u.issueId, n: sql<number>`count(*)::int` })
    .from(u)
    .innerJoin(i, eq(i.id, u.issueId))
    .leftJoin(r, and(eq(r.issueId, u.issueId), eq(r.userId, viewer.id)))
    .where(
      and(
        inArray(u.issueId, mine),
        or(isNull(u.authorId), ne(u.authorId, viewer.id)),
        sql`${u.createdAt} > coalesce(${r.seenAt}, ${i.createdAt})`,
      ),
    )
    .groupBy(u.issueId);
  for (const c of counts) out.set(c.issueId, c.n);
  return out;
}

/** When the reporter last opened the issue, so the timeline can mark what is new; null if never. */
export async function lastSeen(userId: string, issueId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ seenAt: r.seenAt })
    .from(r)
    .where(and(eq(r.issueId, issueId), eq(r.userId, userId)));
  return row?.seenAt ?? null;
}

/** The reporter opened the issue: everything up to now is read. Only ever moves forward. */
export async function markSeen(userId: string, issueId: string) {
  const now = clock.now();
  await getDb()
    .insert(r)
    .values({ issueId, userId, seenAt: now })
    .onConflictDoUpdate({ target: [r.issueId, r.userId], set: { seenAt: sql`greatest(${r.seenAt}, excluded.seen_at)` } });
}

/** The badge: how many of my issues have something I haven't seen. */
export async function mySignals(user: User) {
  const rows = await getDb()
    .select({ id: i.id, reporterId: i.reporterId, createdAt: i.createdAt })
    .from(i)
    .where(eq(i.reporterId, user.id));
  const counts = await unreadCounts(user, rows);
  return { issuesWithUpdates: counts.size, issueUpdates: [...counts.values()].reduce((a, b) => a + b, 0) };
}
