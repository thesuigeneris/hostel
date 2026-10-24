/** Community board: posts, announcements, comments, likes. See personas addendum §5. */
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { newId, type Paginated, type Post, type PostDetail } from '@hostels/shared';
import { db, schema } from '../db';
import { err, pageParams } from '../lib/http';
import { toPost, toPostComment } from '../lib/serialize-community';
import type { UserRow } from '../lib/types';
import { getHostel, requireBoard } from './community-access';
import type { HostelRow } from './owner-access';

type PostRow = typeof schema.posts.$inferSelect;
const authorCols = { id: schema.users.id, name: schema.users.name, role: schema.users.role };

async function decorate(rows: { p: PostRow; a: { id: string; name: string; role: UserRow['role'] } }[], viewerId: string): Promise<Post[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.p.id);
  const [likes, mine, comments] = await Promise.all([
    db.select({ postId: schema.postLikes.postId, n: count() }).from(schema.postLikes).where(inArray(schema.postLikes.postId, ids)).groupBy(schema.postLikes.postId),
    db
      .select({ postId: schema.postLikes.postId })
      .from(schema.postLikes)
      .where(and(inArray(schema.postLikes.postId, ids), eq(schema.postLikes.userId, viewerId))),
    db.select({ postId: schema.postComments.postId, n: count() }).from(schema.postComments).where(inArray(schema.postComments.postId, ids)).groupBy(schema.postComments.postId),
  ]);
  const likeMap = new Map(likes.map((l) => [l.postId, l.n]));
  const mineSet = new Set(mine.map((m) => m.postId));
  const commentMap = new Map(comments.map((c) => [c.postId, c.n]));
  return rows.map(({ p, a }) =>
    toPost(p, a, { likes: likeMap.get(p.id) ?? 0, likedByMe: mineSet.has(p.id), commentCount: commentMap.get(p.id) ?? 0 }),
  );
}

export async function listPosts(user: UserRow, hostelId: string, page?: number): Promise<Paginated<Post>> {
  const hostel = await getHostel(hostelId);
  await requireBoard(user, hostel);
  const pg = pageParams(page);
  const [[total], rows] = await Promise.all([
    db.select({ n: count() }).from(schema.posts).where(eq(schema.posts.hostelId, hostelId)),
    db
      .select({ p: schema.posts, a: authorCols })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.users.id, schema.posts.authorId))
      .where(eq(schema.posts.hostelId, hostelId))
      .orderBy(desc(schema.posts.pinned), desc(schema.posts.createdAt))
      .limit(pg.pageSize)
      .offset(pg.offset),
  ]);
  return { items: await decorate(rows, user.id), total: total!.n, page: pg.page, pageSize: pg.pageSize };
}

export async function createPost(user: UserRow, hostel: HostelRow, body: string, kind: 'post' | 'announcement'): Promise<Post> {
  const [p] = await db.insert(schema.posts).values({ id: newId('pst'), hostelId: hostel.id, authorId: user.id, kind, body }).returning();
  return (await decorate([{ p: p!, a: { id: user.id, name: user.name, role: user.role } }], user.id))[0]!;
}

export async function createResidentPost(user: UserRow, hostelId: string, body: string): Promise<Post> {
  const hostel = await getHostel(hostelId);
  await requireBoard(user, hostel);
  return createPost(user, hostel, body, 'post');
}

/** Loads a post and checks board access. */
async function boardPost(user: UserRow, postId: string) {
  const [p] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId));
  if (!p) throw err.notFound('Post');
  const hostel = await getHostel(p.hostelId);
  const role = await requireBoard(user, hostel);
  return { p, hostel, role };
}

export async function getPost(user: UserRow, postId: string): Promise<PostDetail> {
  const { p } = await boardPost(user, postId);
  const [author] = await db.select(authorCols).from(schema.users).where(eq(schema.users.id, p.authorId));
  const [post] = await decorate([{ p, a: author! }], user.id);
  const comments = await db
    .select({ c: schema.postComments, a: { id: schema.users.id, name: schema.users.name } })
    .from(schema.postComments)
    .innerJoin(schema.users, eq(schema.users.id, schema.postComments.authorId))
    .where(eq(schema.postComments.postId, postId))
    .orderBy(asc(schema.postComments.createdAt));
  return { ...post!, comments: comments.map(({ c, a }) => toPostComment(c, a)) };
}

export async function deletePost(user: UserRow, postId: string) {
  const { p, role } = await boardPost(user, postId);
  if (p.authorId !== user.id && role !== 'owner' && role !== 'admin') throw err.forbidden('Only the author or the hostel owner can delete this post');
  await db.delete(schema.posts).where(eq(schema.posts.id, postId));
}

export async function commentOnPost(user: UserRow, postId: string, body: string) {
  await boardPost(user, postId);
  const [c] = await db.insert(schema.postComments).values({ id: newId('pcm'), postId, authorId: user.id, body }).returning();
  return toPostComment(c!, user);
}

export async function toggleLike(user: UserRow, postId: string) {
  await boardPost(user, postId);
  const deleted = await db
    .delete(schema.postLikes)
    .where(and(eq(schema.postLikes.postId, postId), eq(schema.postLikes.userId, user.id)))
    .returning();
  if (deleted.length === 0) await db.insert(schema.postLikes).values({ postId, userId: user.id }).onConflictDoNothing();
  const [{ n }] = (await db.select({ n: count() }).from(schema.postLikes).where(eq(schema.postLikes.postId, postId))) as [{ n: number }];
  return { liked: deleted.length === 0, likes: n };
}

/** Owner pin/unpin. Ownership is checked by the caller. */
export async function togglePin(user: UserRow, postId: string, assertOwner: (hostelId: string) => Promise<unknown>): Promise<Post> {
  const [p] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId));
  if (!p) throw err.notFound('Post');
  await assertOwner(p.hostelId);
  const [u] = await db.update(schema.posts).set({ pinned: !p.pinned }).where(eq(schema.posts.id, postId)).returning();
  const [author] = await db.select(authorCols).from(schema.users).where(eq(schema.users.id, u!.authorId));
  return (await decorate([{ p: u!, a: author! }], user.id))[0]!;
}
