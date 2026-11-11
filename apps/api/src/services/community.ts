import type { User } from '@hostels/shared';
import { newId, type postInputSchema, publicFirstName } from '@hostels/shared';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { AppError, forbidden, notFound } from '../lib/errors';
import { claimUpload, photoUrl } from '../lib/uploads';
import { requireMember, requirePlan } from './access';

// Issues live in ./issues; these names are still imported from here by routes and jobs.
export {
  autoCloseResolvedIssues,
  ESCALATE_UNACKNOWLEDGED_HOURS,
  ESCALATE_UNRESOLVED_DAYS,
  escalatedIssues,
  hostelIssues,
  issueDetail,
  myIssues,
  ownerIssues,
  reportIssue,
  toggleUpvote,
  updateIssue,
} from './issues';

// --- community board -----------------------------------------------------------

/**
 * Members of the hostel (residents, its owner, admins) while the hostel's plan includes the board. When the plan drops
 * to Free or is paused, residents are told in their own terms: nothing about the owner's bills, and nothing is lost.
 */
async function requireBoard(user: User, hostelId: string) {
  const member = await requireMember(user, hostelId);
  if (user.role === 'admin') return member;
  try {
    await requirePlan(hostelId, 'pro');
  } catch (e) {
    if (member.isOwner || !(e instanceof AppError) || e.code !== 'plan_required') throw e;
    const [posts] = await getDb().select({ n: count() }).from(schema.communityPosts).where(eq(schema.communityPosts.hostelId, hostelId));
    throw new AppError(
      'plan_required',
      posts!.n > 0
        ? "Your hostel's community board is paused for now. Nothing has been deleted: posts come back when the hostel turns the board on again. You can still report issues."
        : "Your hostel hasn't turned on the community board yet. You can still report issues.",
      402,
    );
  }
  return member;
}

/** The board of a post's hostel. Someone who isn't a member gets 404, so post ids don't confirm anything. */
async function requirePostBoard(user: User, hostelId: string) {
  try {
    return await requireBoard(user, hostelId);
  } catch (e) {
    if (e instanceof AppError && e.code === 'not_a_resident') throw notFound('Post');
    throw e;
  }
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
  const author = (id: string, name: string) => (id === hostel!.ownerId ? 'Hostel' : publicFirstName(name));
  return posts.map(({ post, authorName }) => ({
    id: post.id,
    kind: post.kind,
    body: post.body,
    photoUrl: photoUrl(post.photoUrl),
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
      photoUrl: input.photo ? claimUpload(user, input.photo, 'attachment', 'photo') : null,
      pinned: input.kind === 'announcement',
      createdAt: clock.now(),
    })
    .returning();
  return { ...row!, photoUrl: photoUrl(row!.photoUrl), createdAt: row!.createdAt.toISOString() };
}

async function loadPost(user: User, postId: string) {
  const [post] = await getDb().select().from(schema.communityPosts).where(eq(schema.communityPosts.id, postId));
  if (!post) throw notFound('Post');
  const member = await requirePostBoard(user, post.hostelId);
  if (post.hidden && !member.isOwner) throw notFound('Post');
  return { post, ...member };
}

/** Like or unlike a post. Anyone who can read the board can like; hidden posts can't be liked. */
export async function setPostLike(user: User, postId: string, on: boolean) {
  const db = getDb();
  const [post] = await db.select().from(schema.communityPosts).where(eq(schema.communityPosts.id, postId));
  if (!post || post.hidden) throw notFound('Post');
  await requirePostBoard(user, post.hostelId);
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

