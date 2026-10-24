/** Resident issues: reporting, visibility, status flow, comments, upvotes. See personas addendum §4. */
import { and, asc, count, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';
import { newId, type Issue, type IssueDetail, type IssueStatus, type Paginated, type schemas } from '@hostels/shared';
import type { z } from 'zod';
import { db, schema } from '../db';
import { err, pageParams } from '../lib/http';
import { hostelRef, toIssue, toIssueComment } from '../lib/serialize-community';
import type { UserRow } from '../lib/types';
import { boardRole, getHostel, requireActiveResident, requireBoard } from './community-access';
import type { HostelRow } from './owner-access';

type IssueRow = typeof schema.issues.$inferSelect;
type Viewer = Pick<UserRow, 'id' | 'role'> | null;
const reporterCols = { id: schema.users.id, name: schema.users.name };

/** Status moves the owner (or admin) may make. */
export const OWNER_TRANSITIONS: Partial<Record<IssueStatus, IssueStatus[]>> = {
  open: ['acknowledged', 'in_progress', 'resolved'],
  acknowledged: ['in_progress', 'resolved'],
  in_progress: ['resolved'],
};
/** Status moves the reporter (or admin) may make. */
export const REPORTER_TRANSITIONS: Partial<Record<IssueStatus, IssueStatus[]>> = {
  resolved: ['closed', 'open'],
};

export async function decorateIssues(
  rows: { i: IssueRow; r: { id: string; name: string } }[],
  viewer: Viewer,
  opts: { hideReporter?: boolean } = {},
): Promise<Issue[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((x) => x.i.id);
  const [votes, mine] = await Promise.all([
    db.select({ issueId: schema.issueUpvotes.issueId, n: count() }).from(schema.issueUpvotes).where(inArray(schema.issueUpvotes.issueId, ids)).groupBy(schema.issueUpvotes.issueId),
    viewer
      ? db
          .select({ issueId: schema.issueUpvotes.issueId })
          .from(schema.issueUpvotes)
          .where(and(inArray(schema.issueUpvotes.issueId, ids), eq(schema.issueUpvotes.userId, viewer.id)))
      : Promise.resolve([]),
  ]);
  const voteMap = new Map(votes.map((v) => [v.issueId, v.n]));
  const mineSet = new Set(mine.map((m) => m.issueId));
  return rows.map(({ i, r }) => toIssue(i, r, { viewer, upvotes: voteMap.get(i.id) ?? 0, upvotedByMe: mineSet.has(i.id), hideReporter: opts.hideReporter }));
}

export function escalatedCondition(now = new Date()): SQL {
  const i = schema.issues;
  return and(
    inArray(i.status, ['open', 'acknowledged']),
    or(lt(i.createdAt, new Date(now.getTime() - 7 * 86_400_000)), and(eq(i.severity, 'high'), lt(i.createdAt, new Date(now.getTime() - 48 * 3_600_000)))),
  )!;
}

export async function queryIssues(
  where: SQL | undefined,
  viewer: Viewer,
  page?: number,
  opts: { hideReporter?: boolean } = {},
): Promise<Paginated<Issue> & { rows: IssueRow[] }> {
  const pg = pageParams(page);
  const [[total], rows] = await Promise.all([
    db.select({ n: count() }).from(schema.issues).where(where),
    db
      .select({ i: schema.issues, r: reporterCols })
      .from(schema.issues)
      .innerJoin(schema.users, eq(schema.users.id, schema.issues.reporterId))
      .where(where)
      .orderBy(desc(schema.issues.createdAt))
      .limit(pg.pageSize)
      .offset(pg.offset),
  ]);
  return { items: await decorateIssues(rows, viewer, opts), rows: rows.map((r) => r.i), total: total!.n, page: pg.page, pageSize: pg.pageSize };
}

function filters(hostelId: string, q: z.output<typeof schemas.issueListQuery>): SQL {
  const i = schema.issues;
  return and(eq(i.hostelId, hostelId), q.status ? eq(i.status, q.status) : undefined, q.category ? eq(i.category, q.category) : undefined)!;
}

/** Residents, the owner and admins see every issue of the hostel. */
export async function listBoardIssues(user: UserRow, hostelId: string, q: z.output<typeof schemas.issueListQuery>): Promise<Paginated<Issue>> {
  const hostel = await getHostel(hostelId);
  await requireBoard(user, hostel);
  const { rows: _rows, ...page } = await queryIssues(filters(hostelId, q), user, q.page);
  return page;
}

/** Owner issue desk; ownership is checked by the caller. */
export async function listOwnerIssues(user: UserRow, hostelId: string, q: z.output<typeof schemas.issueListQuery>): Promise<Paginated<Issue>> {
  const { rows: _rows, ...page } = await queryIssues(filters(hostelId, q), user, q.page);
  return page;
}

export async function reportIssue(user: UserRow, hostelId: string, input: z.output<typeof schemas.issueInput>): Promise<Issue> {
  await getHostel(hostelId);
  await requireActiveResident(user, hostelId);
  const [i] = await db
    .insert(schema.issues)
    .values({ id: newId('iss'), hostelId, reporterId: user.id, ...input })
    .returning();
  return (await decorateIssues([{ i: i!, r: user }], user))[0]!;
}

/** Board members and the original reporter (even after moving out) can open an issue. */
async function accessibleIssue(user: UserRow, issueId: string): Promise<{ issue: IssueRow; hostel: HostelRow; isOwner: boolean }> {
  const [issue] = await db.select().from(schema.issues).where(eq(schema.issues.id, issueId));
  if (!issue) throw err.notFound('Issue');
  const hostel = await getHostel(issue.hostelId);
  const role = await boardRole(user, hostel);
  if (!role && issue.reporterId !== user.id) throw err.domain('not_resident', 'Only residents of this hostel can see this issue', 403);
  return { issue, hostel, isOwner: role === 'owner' || role === 'admin' };
}

export async function getIssue(user: UserRow, issueId: string): Promise<IssueDetail> {
  const { issue, hostel } = await accessibleIssue(user, issueId);
  const [reporter] = await db.select(reporterCols).from(schema.users).where(eq(schema.users.id, issue.reporterId));
  const [dto] = await decorateIssues([{ i: issue, r: reporter! }], user);
  const comments = await db
    .select({ c: schema.issueComments, a: { id: schema.users.id, name: schema.users.name, role: schema.users.role } })
    .from(schema.issueComments)
    .innerJoin(schema.users, eq(schema.users.id, schema.issueComments.authorId))
    .where(eq(schema.issueComments.issueId, issueId))
    .orderBy(asc(schema.issueComments.createdAt));
  return {
    ...dto!,
    comments: comments.map(({ c, a }) => {
      const dtoC = toIssueComment(c, a, hostel.ownerId);
      // Never reveal an anonymous reporter through their own comments.
      if (issue.anonymous && a.id === issue.reporterId && user.role !== 'admin' && user.id !== issue.reporterId) {
        return { ...dtoC, author: { id: 'anonymous', name: 'Anonymous resident', role: 'tenant' as const } };
      }
      return dtoC;
    }),
  };
}

async function insertComment(user: UserRow, issue: IssueRow, hostel: HostelRow, body: string, now = new Date()) {
  const [c] = await db.insert(schema.issueComments).values({ id: newId('isc'), issueId: issue.id, authorId: user.id, body, createdAt: now }).returning();
  if ((user.id === hostel.ownerId || user.role === 'admin') && !issue.firstResponseAt) {
    await db.update(schema.issues).set({ firstResponseAt: now }).where(eq(schema.issues.id, issue.id));
  }
  return c!;
}

export async function commentOnIssue(user: UserRow, issueId: string, body: string) {
  const { issue, hostel } = await accessibleIssue(user, issueId);
  const c = await insertComment(user, issue, hostel, body);
  return toIssueComment(c, user, hostel.ownerId);
}

export async function setIssueStatus(user: UserRow, issueId: string, input: z.output<typeof schemas.issueStatusInput>, now = new Date()): Promise<Issue> {
  const { issue, hostel } = await accessibleIssue(user, issueId);
  const isAdmin = user.role === 'admin';
  const isOwner = isAdmin || hostel.ownerId === user.id;
  const isReporter = isAdmin || issue.reporterId === user.id;
  const ownerOk = isOwner && (OWNER_TRANSITIONS[issue.status] ?? []).includes(input.status);
  const reporterOk = isReporter && (REPORTER_TRANSITIONS[issue.status] ?? []).includes(input.status);
  if (!ownerOk && !reporterOk) throw err.domain('invalid_transition', `You cannot move this issue from ${issue.status} to ${input.status}`);

  const patch: Partial<typeof schema.issues.$inferInsert> = { status: input.status };
  if (ownerOk) {
    if (input.status === 'acknowledged' || input.status === 'in_progress') patch.acknowledgedAt = issue.acknowledgedAt ?? now;
    if (input.status === 'resolved') patch.resolvedAt = now;
    if (!issue.firstResponseAt) patch.firstResponseAt = now;
  } else if (input.status === 'closed') {
    patch.closedAt = now;
  } else if (input.status === 'open') {
    patch.resolvedAt = null;
  }
  const [updated] = await db.update(schema.issues).set(patch).where(eq(schema.issues.id, issueId)).returning();
  if (input.note) await insertComment(user, { ...updated!, firstResponseAt: updated!.firstResponseAt }, hostel, input.note, now);
  const [reporter] = await db.select(reporterCols).from(schema.users).where(eq(schema.users.id, issue.reporterId));
  return (await decorateIssues([{ i: updated!, r: reporter! }], user))[0]!;
}

export async function toggleUpvote(user: UserRow, issueId: string) {
  const [issue] = await db.select().from(schema.issues).where(eq(schema.issues.id, issueId));
  if (!issue) throw err.notFound('Issue');
  await requireActiveResident(user, issue.hostelId);
  const deleted = await db
    .delete(schema.issueUpvotes)
    .where(and(eq(schema.issueUpvotes.issueId, issueId), eq(schema.issueUpvotes.userId, user.id)))
    .returning();
  if (deleted.length === 0) await db.insert(schema.issueUpvotes).values({ issueId, userId: user.id }).onConflictDoNothing();
  const [{ n }] = (await db.select({ n: count() }).from(schema.issueUpvotes).where(eq(schema.issueUpvotes.issueId, issueId))) as [{ n: number }];
  return { upvoted: deleted.length === 0, upvotes: n };
}

export async function adminIssues(admin: UserRow, q: { status?: IssueStatus; escalated?: boolean; page?: number }, now = new Date()) {
  const where = and(q.status ? eq(schema.issues.status, q.status) : undefined, q.escalated ? escalatedCondition(now) : undefined);
  const { rows, ...page } = await queryIssues(where, admin, q.page);
  const hostelIds = [...new Set(rows.map((r) => r.hostelId))];
  const hostels = hostelIds.length ? await db.select().from(schema.hostels).where(inArray(schema.hostels.id, hostelIds)) : [];
  const byId = new Map(hostels.map((h) => [h.id, hostelRef(h)]));
  return { ...page, items: page.items.map((it) => ({ ...it, hostel: byId.get(it.hostelId)! })) };
}
