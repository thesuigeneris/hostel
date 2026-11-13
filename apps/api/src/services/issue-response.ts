import type { OwnerIssueSummary, ResponseFacts, User } from '@hostels/shared';
import { awaitingReplySince, issueNeedsResponse } from '@hostels/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { hostelIdsOwnedBy } from './access';

type IssueRow = Pick<typeof schema.issues.$inferSelect, 'id' | 'status' | 'createdAt' | 'acknowledgedAt'>;
export type ResponseState = { needsResponse: boolean; awaitingReplySince: string | null };

/**
 * Whether the hostel owes each issue an answer, by the one rule in `@hostels/shared` (`issueNeedsResponse`): an owner
 * comment or status move answers it; a reopen asks again, timed from the reopen. Read from the timeline, so it needs
 * no extra state on the issue. Only open issues can need a response, so only their timelines are read.
 */
export async function responseStates(rows: IssueRow[], now = clock.now()): Promise<Map<string, ResponseState>> {
  const out = new Map<string, ResponseState>();
  const open = rows.filter((r) => r.status === 'open');
  for (const r of rows) out.set(r.id, { needsResponse: false, awaitingReplySince: null });
  if (!open.length) return out;
  const u = schema.issueUpdates;
  const epochMs = (expr: ReturnType<typeof sql>) => sql<number | null>`(extract(epoch from ${expr}) * 1000)::float8`;
  const timeline = await getDb()
    .select({
      issueId: u.issueId,
      reopenedAt: epochMs(sql`max(${u.createdAt}) filter (where ${u.toStatus} = 'open')`),
      ownerRespondedAt: epochMs(sql`max(${u.createdAt}) filter (where ${u.authorId} = ${schema.hostels.ownerId})`),
    })
    .from(u)
    .innerJoin(schema.issues, eq(schema.issues.id, u.issueId))
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.issues.hostelId))
    .where(inArray(u.issueId, open.map((r) => r.id)))
    .groupBy(u.issueId);
  const byIssue = new Map(timeline.map((t) => [t.issueId, t]));
  for (const r of open) {
    const t = byIssue.get(r.id);
    const facts: ResponseFacts = {
      status: r.status,
      createdAt: r.createdAt,
      acknowledgedAt: r.acknowledgedAt,
      reopenedAt: t?.reopenedAt ? new Date(t.reopenedAt) : null,
      ownerRespondedAt: t?.ownerRespondedAt ? new Date(t.ownerRespondedAt) : null,
    };
    out.set(r.id, { needsResponse: issueNeedsResponse(facts, now), awaitingReplySince: awaitingReplySince(facts)?.toISOString() ?? null });
  }
  return out;
}

/** The count behind the owner's Issues tab badges: open issues waiting over a day for the hostel's answer. */
export async function ownerIssueSummary(user: User): Promise<OwnerIssueSummary> {
  const ids = await hostelIdsOwnedBy(user.id);
  if (!ids.length) return { needsResponse: 0, byHostel: {} };
  const i = schema.issues;
  const rows = await getDb()
    .select({ id: i.id, hostelId: i.hostelId, status: i.status, createdAt: i.createdAt, acknowledgedAt: i.acknowledgedAt })
    .from(i)
    .where(and(inArray(i.hostelId, ids), eq(i.status, 'open')));
  const states = await responseStates(rows);
  const byHostel: Record<string, number> = {};
  for (const r of rows) if (states.get(r.id)?.needsResponse) byHostel[r.hostelId] = (byHostel[r.hostelId] ?? 0) + 1;
  return { needsResponse: Object.values(byHostel).reduce((n, v) => n + v, 0), byHostel };
}
