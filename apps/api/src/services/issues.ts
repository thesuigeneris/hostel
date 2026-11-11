import type { IssueStatus, User } from '@hostels/shared';
import { ISSUE_AUTOCLOSE_DAYS, ISSUE_STATUS_WORDS, type issueInputSchema, newId, publicFirstName } from '@hostels/shared';
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { AppError, forbidden, notFound } from '../lib/errors';
import { claimUpload, photoUrl } from '../lib/uploads';
import { hostelIdsOwnedBy, requireMember } from './access';
import { type ResponseState, responseStates } from './issue-response';

type IssueRow = typeof schema.issues.$inferSelect;

/** What the timeline says when an issue closes on its own. */
export const AUTO_CLOSE_MESSAGE = `Closed automatically after ${ISSUE_AUTOCLOSE_DAYS} days. The fix wasn't confirmed or reopened in that time.`;

const changed = () => new AppError('invalid_state', 'This issue just changed. Refresh to see the latest.');
const movedOut = () =>
  new AppError('not_a_resident', "You've moved out, so this issue is read-only for you now. It stays on the hostel's record.", 403);

export async function reportIssue(user: User, hostelId: string, input: z.output<typeof issueInputSchema>) {
  const { residency } = await requireMember(user, hostelId);
  if (!residency) throw new AppError('not_a_resident', 'Only residents can report issues', 403);
  const [row] = await getDb()
    .insert(schema.issues)
    .values({
      id: newId('iss'),
      hostelId,
      reporterId: user.id,
      residencyId: residency.id,
      category: input.category,
      title: input.title,
      description: input.description,
      photoUrl: input.photo ? claimUpload(user, input.photo, 'attachment', 'photo') : null,
      createdAt: clock.now(),
    })
    .returning();
  const [response] = (await responseStates([row!])).values();
  return toIssue(row!, { viewer: user, isOwner: false, readOnly: false, reporterName: user.name, upvotes: 0, upvoted: false, response: response! });
}

type ViewCtx = {
  viewer: User;
  isOwner: boolean;
  readOnly: boolean;
  reporterName: string | null;
  upvotes: number;
  upvoted: boolean;
  response: ResponseState;
};

function toIssue(r: IssueRow, ctx: ViewCtx) {
  const mine = r.reporterId === ctx.viewer.id;
  return {
    id: r.id,
    hostelId: r.hostelId,
    category: r.category,
    title: r.title,
    description: r.description,
    // Built here, after the membership check that every caller of toIssue makes.
    photoUrl: photoUrl(r.photoUrl),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    // Other residents never see who reported an issue.
    reporter: ctx.isOwner || mine ? { id: r.reporterId, name: ctx.reporterName ?? '' } : null,
    mine,
    readOnly: ctx.readOnly,
    upvotes: ctx.upvotes,
    upvotedByMe: ctx.upvoted,
    // One rule (`issueNeedsResponse`): an owner comment or status move answers it; a reopen asks again.
    ...ctx.response,
  };
}

async function decorate(viewer: User, rows: IssueRow[], isOwnerOf: (hostelId: string) => boolean, readOnlyAt: (hostelId: string) => boolean = () => false) {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const [votes, mineVotes, reporters, responses] = await Promise.all([
    db
      .select({ issueId: schema.issueUpvotes.issueId, n: sql<number>`count(*)::int` })
      .from(schema.issueUpvotes)
      .where(inArray(schema.issueUpvotes.issueId, ids))
      .groupBy(schema.issueUpvotes.issueId),
    db
      .select({ issueId: schema.issueUpvotes.issueId })
      .from(schema.issueUpvotes)
      .where(and(inArray(schema.issueUpvotes.issueId, ids), eq(schema.issueUpvotes.userId, viewer.id))),
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(inArray(schema.users.id, [...new Set(rows.map((r) => r.reporterId))])),
    responseStates(rows),
  ]);
  return rows.map((r) =>
    toIssue(r, {
      viewer,
      isOwner: isOwnerOf(r.hostelId),
      readOnly: readOnlyAt(r.hostelId),
      reporterName: reporters.find((u) => u.id === r.reporterId)?.name ?? null,
      upvotes: votes.find((v) => v.issueId === r.id)?.n ?? 0,
      upvoted: mineVotes.some((v) => v.issueId === r.id),
      response: responses.get(r.id)!,
    }),
  );
}

export async function hostelIssues(user: User, hostelId: string, status?: IssueStatus) {
  const { isOwner } = await requireMember(user, hostelId);
  const rows = await getDb()
    .select()
    .from(schema.issues)
    .where(and(eq(schema.issues.hostelId, hostelId), status ? eq(schema.issues.status, status) : undefined))
    .orderBy(desc(schema.issues.createdAt));
  return decorate(user, rows, () => isOwner);
}

/** Issues I reported, at any hostel, newest first. Where I've moved out they stay readable but read-only. */
export async function myIssues(user: User) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.reporterId, user.id))
    .orderBy(desc(schema.issues.createdAt))
    .limit(100);
  const living = await db
    .select({ hostelId: schema.residencies.hostelId })
    .from(schema.residencies)
    .where(and(eq(schema.residencies.userId, user.id), eq(schema.residencies.status, 'active')));
  const here = new Set(living.map((r) => r.hostelId));
  return decorate(user, rows, () => false, (hostelId) => !here.has(hostelId));
}

/** Every issue across the owner's hostels, open ones first. */
export async function ownerIssues(user: User) {
  const ids = await hostelIdsOwnedBy(user.id);
  if (!ids.length) return [];
  const rows = await getDb()
    .select()
    .from(schema.issues)
    .where(inArray(schema.issues.hostelId, ids))
    .orderBy(asc(sql`case ${schema.issues.status} when 'open' then 0 when 'acknowledged' then 1 when 'in_progress' then 2 when 'resolved' then 3 else 4 end`), desc(schema.issues.createdAt));
  return decorate(user, rows, () => true);
}

/**
 * The issue, if the caller may see it: residents of its hostel, its owner and admins. The reporter keeps reading
 * their own issue after moving out (read-only). Anyone else gets 404, so issue ids don't confirm anything.
 */
async function loadIssue(user: User, issueId: string) {
  const [issue] = await getDb().select().from(schema.issues).where(eq(schema.issues.id, issueId));
  if (!issue) throw notFound('Issue');
  try {
    const member = await requireMember(user, issue.hostelId);
    return { issue, ...member, readOnly: false };
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== 'not_a_resident') throw e;
    if (issue.reporterId !== user.id) throw notFound('Issue');
    const [hostel] = await getDb().select().from(schema.hostels).where(eq(schema.hostels.id, issue.hostelId));
    return { issue, hostel: hostel!, residency: null, isOwner: false, readOnly: true };
  }
}

export async function issueDetail(user: User, issueId: string) {
  const { issue, isOwner, hostel, readOnly } = await loadIssue(user, issueId);
  const [decorated] = await decorate(user, [issue], () => isOwner, () => readOnly);
  const updates = await getDb()
    .select({ update: schema.issueUpdates, authorName: schema.users.name, authorRole: schema.users.role })
    .from(schema.issueUpdates)
    .leftJoin(schema.users, eq(schema.users.id, schema.issueUpdates.authorId))
    .where(eq(schema.issueUpdates.issueId, issueId))
    .orderBy(asc(schema.issueUpdates.createdAt), asc(schema.issueUpdates.id));
  return {
    ...decorated!,
    updates: updates.map(({ update, authorName, authorRole }) => {
      const bySystem = update.authorId === null;
      const byOwner = !bySystem && update.authorId === hostel.ownerId;
      const byTeam = !bySystem && !byOwner && authorRole === 'admin';
      // Other residents see "Resident" for anyone but the hostel and our team: comments never reveal who reported.
      const visible = isOwner || update.authorId === user.id;
      return {
        id: update.id,
        message: update.message,
        fromStatus: update.fromStatus,
        toStatus: update.toStatus,
        createdAt: update.createdAt.toISOString(),
        author: bySystem ? 'Automatic' : byOwner ? 'Hostel' : byTeam ? 'Hostels team' : visible ? publicFirstName(authorName) : 'Resident',
        byOwner,
        bySystem,
      };
    }),
  };
}

const OWNER_NEXT: Record<IssueStatus, IssueStatus[]> = {
  open: ['acknowledged', 'in_progress', 'resolved'],
  acknowledged: ['in_progress', 'resolved'],
  in_progress: ['resolved'],
  resolved: [],
  closed: [],
};

/**
 * Owners move an issue forward; the reporter confirms or reopens a resolved one; anyone in the hostel can comment.
 * A status change is one conditional update on the status the caller saw (`from`, else the status read here), so a
 * double tap, two people at once, or the close job racing a reopen make one change; the other gets "refresh".
 */
export async function updateIssue(user: User, issueId: string, input: { status?: IssueStatus; message?: string; from?: IssueStatus }) {
  const { issue, isOwner, readOnly, hostel } = await loadIssue(user, issueId);
  if (readOnly) throw movedOut();
  if (input.from && input.from !== issue.status) throw changed();
  // Only the hostel answering counts as its response (the public response time and "needs response"). An admin acts
  // with the owner's powers, but their comments and moves show as the Hostels team's, never as the hostel's.
  const byHostel = hostel.ownerId === user.id;
  const now = clock.now();
  const set: Partial<IssueRow> = {};
  const to = input.status;
  if (to) {
    // Asking for the status it already has is the second tap of a double submit.
    if (to === issue.status) throw changed();
    const isReporter = issue.reporterId === user.id;
    const isAdmin = user.role === 'admin';
    if (isOwner && (OWNER_NEXT[issue.status].includes(to) || isAdmin)) {
      // allowed
    } else if (isReporter && issue.status === 'resolved' && (to === 'closed' || to === 'open')) {
      const deadline = (issue.resolvedAt?.getTime() ?? 0) + ISSUE_AUTOCLOSE_DAYS * 86_400_000;
      if (to === 'open' && now.getTime() > deadline) {
        throw new AppError(
          'invalid_state',
          `It's more than ${ISSUE_AUTOCLOSE_DAYS} days since this was marked fixed, so it can't be reopened. If it's still a problem, report it again.`,
        );
      }
    } else {
      throw forbidden(`You can't move this issue from ${ISSUE_STATUS_WORDS[issue.status]} to ${ISSUE_STATUS_WORDS[to]}`);
    }
    set.status = to;
    if (to !== 'open' && !issue.acknowledgedAt && byHostel) set.acknowledgedAt = now;
    if (to === 'resolved') set.resolvedAt = now;
    if (to === 'closed') set.closedAt = now;
    if (to === 'open') Object.assign(set, { resolvedAt: null, closedAt: null });
  }
  const i = schema.issues;
  await getDb().transaction(async (tx) => {
    if (to) {
      const moved = await tx
        .update(i)
        .set(set)
        .where(and(eq(i.id, issue.id), eq(i.status, issue.status)))
        .returning({ id: i.id });
      if (!moved.length) throw changed();
    }
    // The hostel's first comment also counts as a response.
    if (byHostel && !set.acknowledgedAt && input.message) {
      await tx.update(i).set({ acknowledgedAt: now }).where(and(eq(i.id, issue.id), isNull(i.acknowledgedAt)));
    }
    await tx.insert(schema.issueUpdates).values({
      id: newId('isu'),
      issueId: issue.id,
      authorId: user.id,
      message: input.message ?? '',
      fromStatus: to ? issue.status : null,
      toStatus: to ?? null,
      createdAt: now,
    });
  });
  return issueDetail(user, issue.id);
}

/** "Me too" from another current resident: once each, never on your own issue, and not once it is closed. */
export async function toggleUpvote(user: User, issueId: string, on: boolean) {
  const { issue, residency, readOnly } = await loadIssue(user, issueId);
  if (readOnly) throw movedOut();
  if (!residency) throw new AppError('not_a_resident', 'Only residents can add a me-too', 403);
  if (issue.reporterId === user.id) throw new AppError('invalid_state', 'You reported this issue');
  if (issue.status === 'closed') {
    throw new AppError('invalid_state', "This issue is closed, so me-toos are off. If it's back, report it again.");
  }
  const db = getDb();
  if (on) await db.insert(schema.issueUpvotes).values({ issueId, userId: user.id }).onConflictDoNothing();
  else await db.delete(schema.issueUpvotes).where(and(eq(schema.issueUpvotes.issueId, issueId), eq(schema.issueUpvotes.userId, user.id)));
  return issueDetail(user, issueId);
}

/**
 * Job: resolved issues the reporter did not answer within 7 days close on their own, with a timeline entry saying
 * so. The update is conditional on `resolved`, so a reopen racing the job wins or loses as a whole.
 */
export async function autoCloseResolvedIssues(now = clock.now()) {
  const cutoff = new Date(now.getTime() - ISSUE_AUTOCLOSE_DAYS * 86_400_000);
  const i = schema.issues;
  return getDb().transaction(async (tx) => {
    const closed = await tx
      .update(i)
      .set({ status: 'closed', closedAt: now })
      .where(and(eq(i.status, 'resolved'), lt(i.resolvedAt, cutoff)))
      .returning({ id: i.id });
    if (closed.length) {
      await tx.insert(schema.issueUpdates).values(
        closed.map((c) => ({
          id: newId('isu'),
          issueId: c.id,
          authorId: null,
          message: AUTO_CLOSE_MESSAGE,
          fromStatus: 'resolved' as const,
          toStatus: 'closed' as const,
          createdAt: now,
        })),
      );
    }
    return closed.length;
  });
}

export const ESCALATE_UNACKNOWLEDGED_HOURS = 48;
export const ESCALATE_UNRESOLVED_DAYS = 7;

/**
 * Issues an admin should chase: still `open` and unacknowledged after 48 hours, or not yet
 * resolved after 7 days. Oldest first.
 */
export async function escalatedIssues(admin: User, now = clock.now()) {
  const i = schema.issues;
  const ackBefore = new Date(now.getTime() - ESCALATE_UNACKNOWLEDGED_HOURS * 3_600_000);
  const unresolvedBefore = new Date(now.getTime() - ESCALATE_UNRESOLVED_DAYS * 86_400_000);
  const rows = await getDb()
    .select({ issue: i, hostelName: schema.hostels.name, hostelSlug: schema.hostels.slug })
    .from(i)
    .innerJoin(schema.hostels, eq(schema.hostels.id, i.hostelId))
    .where(
      sql`(${i.status} = 'open' and ${i.acknowledgedAt} is null and ${i.createdAt} < ${ackBefore.toISOString()}::timestamptz)
        or (${i.status} in ('open', 'acknowledged', 'in_progress') and ${i.createdAt} < ${unresolvedBefore.toISOString()}::timestamptz)`,
    )
    .orderBy(asc(i.createdAt));
  const views = await decorate(admin, rows.map((r) => r.issue), () => true);
  return views.map((v, n) => {
    const { issue, hostelName, hostelSlug } = rows[n]!;
    const unresolved = issue.createdAt < unresolvedBefore;
    return {
      ...v,
      hostelName,
      hostelSlug,
      ageHours: Math.floor((now.getTime() - issue.createdAt.getTime()) / 3_600_000),
      reason: unresolved ? ('unresolved' as const) : ('unacknowledged' as const),
    };
  });
}
