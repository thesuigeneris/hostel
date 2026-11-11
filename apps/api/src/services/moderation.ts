import type { AdminFlaggedReview, AdminHiddenContent, AdminHiddenReview, AdminReport } from '@hostels/shared';
import { firstNameAndInitial, publicFirstName } from '@hostels/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { AppError, notFound } from '../lib/errors';

/**
 * Admin moderation of reviews (flags) and community posts and comments (reports). Hiding is the only lever: nothing
 * is deleted, the author's text stays for the record, and every decision resolves the open flags or reports, so the
 * queue only holds what nobody has looked at yet. The routes write the audit log, with the reason.
 */

const QUEUE_LIMIT = 100;

/** Reviews with open flags, most-flagged first, then the longest waiting. */
export async function flaggedQueue(): Promise<AdminFlaggedReview[]> {
  const f = schema.reviewFlags;
  const r = schema.reviews;
  const rows = await getDb()
    .select({
      review: r,
      author: schema.users.name,
      hostelName: schema.hostels.name,
      hostelSlug: schema.hostels.slug,
      flags: sql<number>`count(${f.id})::int`,
      reasons: sql<string[]>`array_agg(${f.reason} order by ${f.createdAt})`,
      first: sql<Date>`min(${f.createdAt})`,
    })
    .from(f)
    .innerJoin(r, eq(r.id, f.reviewId))
    .innerJoin(schema.users, eq(schema.users.id, r.userId))
    .innerJoin(schema.hostels, eq(schema.hostels.id, r.hostelId))
    .where(eq(f.resolved, false))
    .groupBy(r.id, schema.users.name, schema.hostels.name, schema.hostels.slug)
    .orderBy(sql`count(${f.id}) desc`, sql`min(${f.createdAt})`, r.id)
    .limit(QUEUE_LIMIT);
  return rows.map((x) => ({
    review: {
      id: x.review.id,
      hostelId: x.review.hostelId,
      rating: x.review.rating,
      body: x.review.body,
      author: firstNameAndInitial(x.author),
      hidden: x.review.hidden,
      createdAt: x.review.createdAt.toISOString(),
      updatedAt: x.review.updatedAt.toISOString(),
    },
    hostelName: x.hostelName,
    hostelSlug: x.hostelSlug,
    flags: x.flags,
    reasons: x.reasons,
    firstFlaggedAt: new Date(x.first).toISOString(),
  }));
}

/** Hidden reviews, newest first, so an admin can show one again. */
export async function hiddenReviews(): Promise<AdminHiddenReview[]> {
  const r = schema.reviews;
  const rows = await getDb()
    .select({ review: r, author: schema.users.name, hostelName: schema.hostels.name })
    .from(r)
    .innerJoin(schema.users, eq(schema.users.id, r.userId))
    .innerJoin(schema.hostels, eq(schema.hostels.id, r.hostelId))
    .where(eq(r.hidden, true))
    .orderBy(desc(r.updatedAt), r.id)
    .limit(QUEUE_LIMIT);
  return rows.map((x) => ({
    review: {
      id: x.review.id,
      hostelId: x.review.hostelId,
      rating: x.review.rating,
      body: x.review.body,
      author: firstNameAndInitial(x.author),
      hiddenReason: x.review.hiddenReason,
      updatedAt: x.review.updatedAt.toISOString(),
    },
    hostelName: x.hostelName,
  }));
}

/** Keeps a flagged review up: its open flags are dismissed. A review hidden meanwhile is left alone. */
export async function keepReview(reviewId: string) {
  const db = getDb();
  const [review] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, reviewId));
  if (!review) throw notFound('Review');
  if (review.hidden) throw new AppError('invalid_state', 'This review is hidden now; show it again instead');
  const dismissed = await db
    .update(schema.reviewFlags)
    .set({ resolved: true })
    .where(and(eq(schema.reviewFlags.reviewId, reviewId), eq(schema.reviewFlags.resolved, false)))
    .returning({ id: schema.reviewFlags.id });
  return { id: review.id, dismissed: dismissed.length };
}

// --- community reports ---------------------------------------------------------

type Target = { type: 'post' | 'comment'; id: string };

async function contentOf(targets: Target[]) {
  const db = getDb();
  const postIds = targets.filter((t) => t.type === 'post').map((t) => t.id);
  const commentIds = targets.filter((t) => t.type === 'comment').map((t) => t.id);
  const [posts, comments] = await Promise.all([
    postIds.length
      ? db
          .select({ row: schema.communityPosts, name: schema.users.name, ownerId: schema.hostels.ownerId })
          .from(schema.communityPosts)
          .innerJoin(schema.users, eq(schema.users.id, schema.communityPosts.authorId))
          .innerJoin(schema.hostels, eq(schema.hostels.id, schema.communityPosts.hostelId))
          .where(inArray(schema.communityPosts.id, postIds))
      : [],
    commentIds.length
      ? db
          .select({ row: schema.communityComments, name: schema.users.name, ownerId: schema.hostels.ownerId })
          .from(schema.communityComments)
          .innerJoin(schema.users, eq(schema.users.id, schema.communityComments.authorId))
          .innerJoin(schema.communityPosts, eq(schema.communityPosts.id, schema.communityComments.postId))
          .innerJoin(schema.hostels, eq(schema.hostels.id, schema.communityPosts.hostelId))
          .where(inArray(schema.communityComments.id, commentIds))
      : [],
  ]);
  const out = new Map<string, { body: string; author: string; hidden: boolean; createdAt: string }>();
  // The board's own words: the hostel's posts read "Hostel", residents by first name, as residents see them.
  for (const p of posts) out.set(`post:${p.row.id}`, view(p.row, p.row.authorId === p.ownerId ? 'Hostel' : publicFirstName(p.name)));
  for (const c of comments) out.set(`comment:${c.row.id}`, view(c.row, c.row.authorId === c.ownerId ? 'Hostel' : publicFirstName(c.name)));
  return out;
}

function view(row: { body: string; hidden: boolean; createdAt: Date }, author: string) {
  return { body: row.body, author, hidden: row.hidden, createdAt: row.createdAt.toISOString() };
}

/** Open reports, one entry per post or comment, most-reported first. */
export async function reportQueue(): Promise<AdminReport[]> {
  const c = schema.contentReports;
  const groups = await getDb()
    .select({
      targetType: c.targetType,
      targetId: c.targetId,
      hostelId: c.hostelId,
      hostelName: schema.hostels.name,
      reports: sql<number>`count(*)::int`,
      reasons: sql<string[]>`array_agg(${c.reason} order by ${c.createdAt})`,
      first: sql<Date>`min(${c.createdAt})`,
    })
    .from(c)
    .innerJoin(schema.hostels, eq(schema.hostels.id, c.hostelId))
    .where(eq(c.resolved, false))
    .groupBy(c.targetType, c.targetId, c.hostelId, schema.hostels.name)
    .orderBy(sql`count(*) desc`, sql`min(${c.createdAt})`, c.targetId)
    .limit(QUEUE_LIMIT);
  const content = await contentOf(groups.map((g) => ({ type: g.targetType, id: g.targetId })));
  return groups.map((g) => ({
    targetType: g.targetType,
    targetId: g.targetId,
    hostelId: g.hostelId,
    hostelName: g.hostelName,
    reports: g.reports,
    reasons: g.reasons,
    firstReportedAt: new Date(g.first).toISOString(),
    content: content.get(`${g.targetType}:${g.targetId}`) ?? null,
  }));
}

/** Hides, shows again, or keeps (dismisses the reports on) a post or comment. Returns the hostel it belongs to. */
export async function moderateContent(target: Target, action: 'hide' | 'unhide' | 'keep') {
  const db = getDb();
  return db.transaction(async (tx) => {
    let hostelId: string;
    if (target.type === 'post') {
      const [post] = await tx.select().from(schema.communityPosts).where(eq(schema.communityPosts.id, target.id));
      if (!post && action !== 'keep') throw notFound('Post');
      hostelId = post?.hostelId ?? '';
      if (post && action !== 'keep') {
        await tx.update(schema.communityPosts).set({ hidden: action === 'hide' }).where(eq(schema.communityPosts.id, post.id));
      }
    } else {
      const [comment] = await tx
        .select({ id: schema.communityComments.id, hostelId: schema.communityPosts.hostelId })
        .from(schema.communityComments)
        .innerJoin(schema.communityPosts, eq(schema.communityPosts.id, schema.communityComments.postId))
        .where(eq(schema.communityComments.id, target.id));
      if (!comment && action !== 'keep') throw notFound('Comment');
      hostelId = comment?.hostelId ?? '';
      if (comment && action !== 'keep') {
        await tx.update(schema.communityComments).set({ hidden: action === 'hide' }).where(eq(schema.communityComments.id, comment.id));
      }
    }
    // Deleted content can still have reports waiting; keeping them clears the queue.
    const resolved = await tx
      .update(schema.contentReports)
      .set({ resolved: true })
      .where(and(eq(schema.contentReports.targetType, target.type), eq(schema.contentReports.targetId, target.id), eq(schema.contentReports.resolved, false)))
      .returning({ hostelId: schema.contentReports.hostelId });
    if (!hostelId && !resolved.length) throw notFound(target.type === 'post' ? 'Post' : 'Comment');
    return { hostelId: hostelId || resolved[0]!.hostelId, resolved: resolved.length };
  });
}

/** Hidden posts and comments, newest first, so an admin can show one again. */
export async function hiddenContent(): Promise<AdminHiddenContent[]> {
  const db = getDb();
  const [posts, comments] = await Promise.all([
    db
      .select({ id: schema.communityPosts.id, hostelId: schema.communityPosts.hostelId })
      .from(schema.communityPosts)
      .where(eq(schema.communityPosts.hidden, true))
      .orderBy(desc(schema.communityPosts.createdAt))
      .limit(50),
    db
      .select({ id: schema.communityComments.id, hostelId: schema.communityPosts.hostelId })
      .from(schema.communityComments)
      .innerJoin(schema.communityPosts, eq(schema.communityPosts.id, schema.communityComments.postId))
      .where(eq(schema.communityComments.hidden, true))
      .orderBy(desc(schema.communityComments.createdAt))
      .limit(50),
  ]);
  const targets: (Target & { hostelId: string })[] = [
    ...posts.map((p) => ({ type: 'post' as const, id: p.id, hostelId: p.hostelId })),
    ...comments.map((c) => ({ type: 'comment' as const, id: c.id, hostelId: c.hostelId })),
  ];
  if (!targets.length) return [];
  const [content, hostels] = await Promise.all([
    contentOf(targets),
    db
      .select({ id: schema.hostels.id, name: schema.hostels.name })
      .from(schema.hostels)
      .where(inArray(schema.hostels.id, [...new Set(targets.map((t) => t.hostelId))])),
  ]);
  return targets
    .map((t) => {
      const c = content.get(`${t.type}:${t.id}`)!;
      return {
        targetType: t.type,
        targetId: t.id,
        hostelId: t.hostelId,
        hostelName: hostels.find((h) => h.id === t.hostelId)?.name ?? '',
        body: c.body,
        author: c.author,
        createdAt: c.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
