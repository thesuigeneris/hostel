import type { IssueStatus, User } from '@hostels/shared';
import { ISSUE_AUTOCLOSE_DAYS, type issueInputSchema, newId, type postInputSchema } from '@hostels/shared';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { AppError, forbidden, notFound } from '../lib/errors';
import { hostelIdsOwnedBy, requireMember, requirePlan } from './access';

type IssueRow = typeof schema.issues.$inferSelect;

function shortName(name: string | null | undefined) {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'Resident';
}

// --- issues ------------------------------------------------------------------

export async function reportIssue(user: User, hostelId: string, input: z.output<typeof issueInputSchema>) {
  const { residency } = await requireMember(user, hostelId);
  if (!residency) throw new AppError('not_a_resident', 'Only residents can report issues', 403);
  const [row] = await getDb()
    .insert(schema.issues)
    .values({ id: newId('iss'), hostelId, reporterId: user.id, residencyId: residency.id, ...input, photoUrl: input.photoUrl ?? null, createdAt: clock.now() })
    .returning();
  return toIssue(row!, { viewer: user, isOwner: false, reporterName: user.name, upvotes: 0, upvoted: false });
}

function toIssue(r: IssueRow, ctx: { viewer: User; isOwner: boolean; reporterName: string | null; upvotes: number; upvoted: boolean }) {
  const mine = r.reporterId === ctx.viewer.id;
  return {
    id: r.id,
    hostelId: r.hostelId,
    category: r.category,
    title: r.title,
    description: r.description,
    photoUrl: r.photoUrl,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    // Other residents never see who reported an issue.
    reporter: ctx.isOwner || mine ? { id: r.reporterId, name: ctx.reporterName ?? '' } : null,
    mine,
    upvotes: ctx.upvotes,
    upvotedByMe: ctx.upvoted,
    needsResponse: r.status === 'open' && clock.now().getTime() - r.createdAt.getTime() > 24 * 3600_000,
  };
}

async function decorate(viewer: User, rows: IssueRow[], isOwnerOf: (hostelId: string) => boolean) {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const [votes, mineVotes, reporters] = await Promise.all([
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
  ]);
  return rows.map((r) =>
    toIssue(r, {
      viewer,
      isOwner: isOwnerOf(r.hostelId),
      reporterName: reporters.find((u) => u.id === r.reporterId)?.name ?? null,
      upvotes: votes.find((v) => v.issueId === r.id)?.n ?? 0,
      upvoted: mineVotes.some((v) => v.issueId === r.id),
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

async function loadIssue(user: User, issueId: string) {
  const [issue] = await getDb().select().from(schema.issues).where(eq(schema.issues.id, issueId));
  if (!issue) throw notFound('Issue');
  const member = await requireMember(user, issue.hostelId);
  return { issue, ...member };
}

export async function issueDetail(user: User, issueId: string) {
  const { issue, isOwner, hostel } = await loadIssue(user, issueId);
  const [decorated] = await decorate(user, [issue], () => isOwner);
  const updates = await getDb()
    .select({ update: schema.issueUpdates, authorName: schema.users.name })
    .from(schema.issueUpdates)
    .innerJoin(schema.users, eq(schema.users.id, schema.issueUpdates.authorId))
    .where(eq(schema.issueUpdates.issueId, issueId))
    .orderBy(asc(schema.issueUpdates.createdAt));
  return {
    ...decorated!,
    updates: updates.map(({ update, authorName }) => {
      const byOwner = update.authorId === hostel.ownerId;
      const visible = isOwner || byOwner || update.authorId === user.id;
      return {
        id: update.id,
        message: update.message,
        fromStatus: update.fromStatus,
        toStatus: update.toStatus,
        createdAt: update.createdAt.toISOString(),
        author: byOwner ? 'Hostel' : visible ? shortName(authorName) : 'Resident',
        byOwner,
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

/** Owners move an issue forward; the reporter confirms or reopens a resolved one; anyone in the hostel can comment. */
export async function updateIssue(user: User, issueId: string, input: { status?: IssueStatus; message?: string }) {
  const { issue, isOwner } = await loadIssue(user, issueId);
  const now = clock.now();
  const set: Partial<IssueRow> = {};
  const to = input.status;
  if (to && to !== issue.status) {
    const isReporter = issue.reporterId === user.id;
    const isAdmin = user.role === 'admin';
    if (isOwner && (OWNER_NEXT[issue.status].includes(to) || isAdmin)) {
      // allowed
    } else if (isReporter && issue.status === 'resolved' && (to === 'closed' || to === 'open')) {
      const deadline = (issue.resolvedAt?.getTime() ?? 0) + ISSUE_AUTOCLOSE_DAYS * 86_400_000;
      if (to === 'open' && now.getTime() > deadline) throw new AppError('invalid_state', 'This issue can no longer be reopened; report it again');
    } else {
      throw forbidden(`You cannot move this issue from ${issue.status} to ${to}`);
    }
    set.status = to;
    if (to !== 'open' && !issue.acknowledgedAt) set.acknowledgedAt = now;
    if (to === 'resolved') set.resolvedAt = now;
    if (to === 'closed') set.closedAt = now;
    if (to === 'open') Object.assign(set, { resolvedAt: null, closedAt: null });
  } else if (!input.message) {
    throw new AppError('validation', 'Nothing to update', 400);
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    if (Object.keys(set).length) await tx.update(schema.issues).set(set).where(eq(schema.issues.id, issue.id));
    // An owner's first comment also counts as a response.
    if (isOwner && !set.acknowledgedAt && !issue.acknowledgedAt && input.message) {
      await tx.update(schema.issues).set({ acknowledgedAt: now }).where(eq(schema.issues.id, issue.id));
    }
    await tx.insert(schema.issueUpdates).values({
      id: newId('isu'),
      issueId: issue.id,
      authorId: user.id,
      message: input.message ?? '',
      fromStatus: set.status ? issue.status : null,
      toStatus: set.status ?? null,
      createdAt: now,
    });
  });
  return issueDetail(user, issue.id);
}

export async function toggleUpvote(user: User, issueId: string, on: boolean) {
  const { issue, residency } = await loadIssue(user, issueId);
  if (!residency) throw new AppError('not_a_resident', 'Only residents can add a me-too', 403);
  if (issue.reporterId === user.id) throw new AppError('invalid_state', 'You reported this issue');
  const db = getDb();
  if (on) await db.insert(schema.issueUpvotes).values({ issueId, userId: user.id }).onConflictDoNothing();
  else await db.delete(schema.issueUpvotes).where(and(eq(schema.issueUpvotes.issueId, issueId), eq(schema.issueUpvotes.userId, user.id)));
  return issueDetail(user, issueId);
}

/** Job: resolved issues the reporter did not answer within 7 days close on their own. */
export async function autoCloseResolvedIssues(now = clock.now()) {
  const cutoff = new Date(now.getTime() - ISSUE_AUTOCLOSE_DAYS * 86_400_000);
  const rows = await getDb()
    .update(schema.issues)
    .set({ status: 'closed', closedAt: now })
    .where(and(eq(schema.issues.status, 'resolved'), lt(schema.issues.resolvedAt, cutoff)))
    .returning({ id: schema.issues.id });
  return rows.length;
}

// --- community board -----------------------------------------------------------

async function requireBoard(user: User, hostelId: string) {
  const member = await requireMember(user, hostelId);
  if (user.role !== 'admin') await requirePlan(hostelId, 'pro');
  return member;
}

export async function feed(user: User, hostelId: string) {
  const { isOwner } = await requireBoard(user, hostelId);
  const db = getDb();
  const posts = await db
    .select({ post: schema.communityPosts, authorName: schema.users.name })
    .from(schema.communityPosts)
    .innerJoin(schema.users, eq(schema.users.id, schema.communityPosts.authorId))
    .where(and(eq(schema.communityPosts.hostelId, hostelId), isOwner ? undefined : eq(schema.communityPosts.hidden, false)))
    .orderBy(desc(schema.communityPosts.pinned), desc(schema.communityPosts.createdAt))
    .limit(100);
  const ids = posts.map((p) => p.post.id);
  const comments = ids.length
    ? await db
        .select({ comment: schema.communityComments, authorName: schema.users.name })
        .from(schema.communityComments)
        .innerJoin(schema.users, eq(schema.users.id, schema.communityComments.authorId))
        .where(and(inArray(schema.communityComments.postId, ids), isOwner ? undefined : eq(schema.communityComments.hidden, false)))
        .orderBy(asc(schema.communityComments.createdAt))
    : [];
  const likes = ids.length
    ? await db
        .select({
          postId: schema.communityPostLikes.postId,
          n: sql<number>`count(*)::int`,
          mine: sql<boolean>`bool_or(${schema.communityPostLikes.userId} = ${user.id})`,
        })
        .from(schema.communityPostLikes)
        .where(inArray(schema.communityPostLikes.postId, ids))
        .groupBy(schema.communityPostLikes.postId)
    : [];
  const likesFor = new Map(likes.map((l) => [l.postId, l]));
  const [hostel] = await db.select({ ownerId: schema.hostels.ownerId }).from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  const author = (id: string, name: string) => (id === hostel!.ownerId ? 'Hostel' : shortName(name));
  return posts.map(({ post, authorName }) => ({
    id: post.id,
    kind: post.kind,
    body: post.body,
    photoUrl: post.photoUrl,
    pinned: post.pinned,
    hidden: post.hidden,
    createdAt: post.createdAt.toISOString(),
    author: author(post.authorId, authorName),
    mine: post.authorId === user.id,
    likes: likesFor.get(post.id)?.n ?? 0,
    likedByMe: likesFor.get(post.id)?.mine ?? false,
    comments: comments
      .filter((c) => c.comment.postId === post.id)
      .map(({ comment, authorName: n }) => ({
        id: comment.id,
        body: comment.body,
        hidden: comment.hidden,
        createdAt: comment.createdAt.toISOString(),
        author: author(comment.authorId, n),
        mine: comment.authorId === user.id,
      })),
  }));
}

export async function createPost(user: User, hostelId: string, input: z.output<typeof postInputSchema>) {
  const { isOwner } = await requireBoard(user, hostelId);
  if (input.kind === 'announcement' && !isOwner) throw forbidden('Only the hostel can post announcements');
  const [row] = await getDb()
    .insert(schema.communityPosts)
    .values({
      id: newId('pst'),
      hostelId,
      authorId: user.id,
      kind: input.kind,
      body: input.body,
      photoUrl: input.photoUrl ?? null,
      pinned: input.kind === 'announcement',
      createdAt: clock.now(),
    })
    .returning();
  return { ...row!, createdAt: row!.createdAt.toISOString() };
}

async function loadPost(user: User, postId: string) {
  const [post] = await getDb().select().from(schema.communityPosts).where(eq(schema.communityPosts.id, postId));
  if (!post) throw notFound('Post');
  const member = await requireBoard(user, post.hostelId);
  if (post.hidden && !member.isOwner) throw notFound('Post');
  return { post, ...member };
}

/** Like or unlike a post. Anyone who can read the board can like; hidden posts can't be liked. */
export async function setPostLike(user: User, postId: string, on: boolean) {
  const db = getDb();
  const [post] = await db.select().from(schema.communityPosts).where(eq(schema.communityPosts.id, postId));
  if (!post || post.hidden) throw notFound('Post');
  await requireBoard(user, post.hostelId);
  const like = schema.communityPostLikes;
  if (on) await db.insert(like).values({ postId, userId: user.id }).onConflictDoNothing();
  else await db.delete(like).where(and(eq(like.postId, postId), eq(like.userId, user.id)));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`, mine: sql<boolean>`coalesce(bool_or(${like.userId} = ${user.id}), false)` })
    .from(like)
    .where(eq(like.postId, postId));
  return { likes: row?.n ?? 0, likedByMe: row?.mine ?? false };
}

export async function addComment(user: User, postId: string, body: string) {
  const { post } = await loadPost(user, postId);
  const [row] = await getDb()
    .insert(schema.communityComments)
    .values({ id: newId('cmt'), postId: post.id, authorId: user.id, body, createdAt: clock.now() })
    .returning();
  return { ...row!, createdAt: row!.createdAt.toISOString() };
}

export async function deletePost(user: User, postId: string) {
  const { post, isOwner } = await loadPost(user, postId);
  if (post.authorId !== user.id && !isOwner) throw forbidden();
  await getDb().delete(schema.communityPosts).where(eq(schema.communityPosts.id, post.id));
}

export async function deleteComment(user: User, commentId: string) {
  const db = getDb();
  const [c] = await db.select().from(schema.communityComments).where(eq(schema.communityComments.id, commentId));
  if (!c) throw notFound('Comment');
  const { isOwner } = await loadPost(user, c.postId);
  if (c.authorId !== user.id && !isOwner) throw forbidden();
  await db.delete(schema.communityComments).where(eq(schema.communityComments.id, c.id));
}

/** Owners and admins hide or pin; hidden content stays visible to them for review. */
export async function moderatePost(user: User, postId: string, patch: { hidden?: boolean; pinned?: boolean }) {
  const { post, isOwner } = await loadPost(user, postId);
  if (!isOwner) throw forbidden();
  const [row] = await getDb().update(schema.communityPosts).set(patch).where(eq(schema.communityPosts.id, post.id)).returning();
  await getDb()
    .update(schema.contentReports)
    .set({ resolved: true })
    .where(and(eq(schema.contentReports.targetType, 'post'), eq(schema.contentReports.targetId, post.id)));
  return { ...row!, createdAt: row!.createdAt.toISOString() };
}

export async function moderateComment(user: User, commentId: string, hidden: boolean) {
  const db = getDb();
  const [c] = await db.select().from(schema.communityComments).where(eq(schema.communityComments.id, commentId));
  if (!c) throw notFound('Comment');
  const { isOwner } = await loadPost(user, c.postId);
  if (!isOwner) throw forbidden();
  await db.update(schema.communityComments).set({ hidden }).where(eq(schema.communityComments.id, c.id));
  await db
    .update(schema.contentReports)
    .set({ resolved: true })
    .where(and(eq(schema.contentReports.targetType, 'comment'), eq(schema.contentReports.targetId, c.id)));
  return { ok: true as const };
}

export async function reportContent(user: User, targetType: 'post' | 'comment', targetId: string, reason: string) {
  const db = getDb();
  let postId = targetId;
  if (targetType === 'comment') {
    const [c] = await db.select().from(schema.communityComments).where(eq(schema.communityComments.id, targetId));
    if (!c) throw notFound('Comment');
    postId = c.postId;
  }
  const { post } = await loadPost(user, postId);
  await db
    .insert(schema.contentReports)
    .values({ id: newId('rpt'), targetType, targetId, hostelId: post.hostelId, userId: user.id, reason })
    .onConflictDoNothing();
  return { ok: true as const };
}

export async function openReports(filter: { hostelIds?: string[] } = {}) {
  if (filter.hostelIds && !filter.hostelIds.length) return [];
  const rows = await getDb()
    .select({ report: schema.contentReports, hostelName: schema.hostels.name })
    .from(schema.contentReports)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.contentReports.hostelId))
    .where(and(eq(schema.contentReports.resolved, false), filter.hostelIds ? inArray(schema.contentReports.hostelId, filter.hostelIds) : undefined))
    .orderBy(desc(schema.contentReports.createdAt));
  return rows.map((r) => ({ ...r.report, createdAt: r.report.createdAt.toISOString(), hostelName: r.hostelName }));
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
