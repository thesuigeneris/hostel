import type { User } from '@hostels/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { AppError } from '../lib/errors';
import { storage } from '../lib/storage';
import { photoUrl, uploadKeyOf } from '../lib/uploads';
import { clearLoginAttempts, locked, takeLoginAttempt } from './auth';
import { toUser } from './mappers';

/**
 * A person's rights over their data under India's DPDP Act 2023 (product gap 1c, spec
 * docs/superpowers/specs/2026-11-13-account-deletion-and-export.md): a copy of everything we hold about them, and
 * deleting the account. Deleting erases who they are and what they wrote on the board; reviews and issues stay on the
 * hostel's record without their name; bills and payments stay because the law requires financial records to be kept.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Everything we hold about the signed-in person, as one JSON document they can download. */
export async function exportMyData(user: User) {
  const db = getDb();
  const s = schema;
  const [me] = await db.select().from(s.users).where(eq(s.users.id, user.id));
  const subs = await db.select().from(s.subscriptions).where(eq(s.subscriptions.userId, user.id));
  const subIds = subs.map((x) => x.id);
  const [
    invoices,
    skips,
    moves,
    foodChanges,
    residencies,
    reviews,
    issues,
    issueUpdates,
    posts,
    comments,
    likes,
    visits,
    refunds,
    flags,
    reports,
    upvotes,
  ] = await Promise.all([
    db.select().from(s.invoices).where(eq(s.invoices.userId, user.id)),
    subIds.length ? db.select().from(s.mealSkips).where(inArray(s.mealSkips.subscriptionId, subIds)) : [],
    subIds.length ? db.select().from(s.moveRequests).where(inArray(s.moveRequests.subscriptionId, subIds)) : [],
    subIds.length ? db.select().from(s.foodPlanChanges).where(inArray(s.foodPlanChanges.subscriptionId, subIds)) : [],
    db.select().from(s.residencies).where(eq(s.residencies.userId, user.id)),
    db.select().from(s.reviews).where(eq(s.reviews.userId, user.id)),
    db.select().from(s.issues).where(eq(s.issues.reporterId, user.id)),
    db.select().from(s.issueUpdates).where(eq(s.issueUpdates.authorId, user.id)),
    db.select().from(s.communityPosts).where(eq(s.communityPosts.authorId, user.id)),
    db.select().from(s.communityComments).where(eq(s.communityComments.authorId, user.id)),
    db.select().from(s.communityPostLikes).where(eq(s.communityPostLikes.userId, user.id)),
    db.select().from(s.visitRequests).where(eq(s.visitRequests.userId, user.id)),
    db.select().from(s.paymentExceptions).where(eq(s.paymentExceptions.userId, user.id)),
    db.select().from(s.reviewFlags).where(eq(s.reviewFlags.userId, user.id)),
    db.select().from(s.contentReports).where(eq(s.contentReports.userId, user.id)),
    db.select().from(s.issueUpvotes).where(eq(s.issueUpvotes.userId, user.id)),
  ]);
  // Rows go out as stored, minus secrets and internal payment references; photos as links that work for an hour or so.
  const photo = <T extends { photoUrl: string | null }>(r: T) => ({ ...r, photoUrl: r.photoUrl ? photoUrl(r.photoUrl) : null });
  return {
    exportedAt: clock.now().toISOString(),
    about:
      'Everything Hostels holds about you, as of the time above. Bills and payments are kept for as long as the law requires, even after you delete your account.',
    account: { ...toUser(me!), deletedAt: iso(me!.deletedAt) },
    subscriptions: subs,
    bills: invoices.map(({ razorpayOrderId: _o, ...r }) => r),
    mealSkips: skips,
    moves,
    foodPlanChanges: foodChanges,
    stays: residencies,
    reviews,
    issuesReported: issues.map(photo),
    issueComments: issueUpdates,
    issueMeToos: upvotes,
    boardPosts: posts.map(photo),
    boardComments: comments,
    boardLikes: likes,
    visitRequests: visits,
    refunds: refunds.map(({ razorpayOrderId: _o, ...r }) => r),
    reviewFlags: flags,
    contentReports: reports,
  };
}

/** Why an account can't be deleted yet, in the person's words; null when it can. */
async function blocker(user: User): Promise<string | null> {
  const db = getDb();
  if (user.isDemo) return 'Demo accounts can’t be deleted.';
  if (user.role === 'admin') return 'Admins are removed by the platform team, not here.';
  const [hostel] = await db.select({ id: schema.hostels.id }).from(schema.hostels).where(eq(schema.hostels.ownerId, user.id)).limit(1);
  if (hostel) return 'You own a hostel on Hostels. Write to us to close or hand over your listing first.';
  const [open] = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, user.id), inArray(schema.subscriptions.status, ['pending', 'active'])))
    .limit(1);
  if (open) return 'You have a plan running. Cancel it, and delete your account once it has ended.';
  const [due] = await db
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.userId, user.id), eq(schema.invoices.status, 'due')))
    .limit(1);
  if (due) return 'You have a bill to pay first.';
  const [owed] = await db
    .select({ id: schema.paymentExceptions.id })
    .from(schema.paymentExceptions)
    .where(and(eq(schema.paymentExceptions.userId, user.id), eq(schema.paymentExceptions.status, 'refund_due')))
    .limit(1);
  if (owed) return 'We still owe you a refund. You can delete your account once it has reached you.';
  return null;
}

/** For the account page: whether deleting is possible now, and if not, what to do first. */
export async function deletionStatus(user: User) {
  const reason = await blocker(user);
  return { canDelete: reason === null, reason };
}

/**
 * Deletes the account: erases who the person is and what they wrote, keeps the hostel's record without their name and
 * the bills the law makes us keep. Signs them out everywhere. Cannot be undone.
 */
export async function deleteMyAccount(user: User, input: { confirm: string; password?: string }) {
  if (input.confirm !== 'DELETE') throw new AppError('validation', 'Type DELETE to confirm.', 400, [{ path: 'confirm', message: 'Type DELETE' }]);
  const reason = await blocker(user);
  if (reason) throw new AppError('invalid_state', reason);
  const db = getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  if (!row || row.deletedAt) throw new AppError('invalid_state', 'This account is already deleted.');
  if (row.passwordHash) {
    // A stolen session must not be enough to delete someone's account.
    if (!(await takeLoginAttempt(row.phone, clock.now()))) throw locked();
    if (!input.password || !(await Bun.password.verify(input.password, row.passwordHash))) {
      throw new AppError('invalid_credentials', 'Your password is wrong.', 401, [{ path: 'password', message: 'Wrong password' }]);
    }
    await clearLoginAttempts(row.phone);
  }

  const s = schema;
  const photos: string[] = [];
  await db.transaction(async (tx) => {
    const posts = await tx.select({ id: s.communityPosts.id, photoUrl: s.communityPosts.photoUrl }).from(s.communityPosts).where(eq(s.communityPosts.authorId, user.id));
    const issues = await tx.select({ id: s.issues.id, photoUrl: s.issues.photoUrl }).from(s.issues).where(eq(s.issues.reporterId, user.id));
    for (const p of [...posts, ...issues]) if (p.photoUrl) photos.push(p.photoUrl);

    // What they wrote on the board, and their likes, go (replies to their posts go with the post, as when they delete one).
    await tx.delete(s.communityComments).where(eq(s.communityComments.authorId, user.id));
    await tx.delete(s.communityPosts).where(eq(s.communityPosts.authorId, user.id));
    await tx.delete(s.communityPostLikes).where(eq(s.communityPostLikes.userId, user.id));
    await tx.delete(s.visitRequests).where(eq(s.visitRequests.userId, user.id));
    await tx.delete(s.issueReads).where(eq(s.issueReads.userId, user.id));
    // Issues and reviews stay on the hostel's record; nothing on them says who wrote them once the name is gone.
    await tx.update(s.issues).set({ photoUrl: null }).where(eq(s.issues.reporterId, user.id));
    // Stays: an open one ends today (an invite is declined), so the hostel's roster no longer lists them; then the
    // name and phone on every stay are erased. The stay itself stays, as the proof behind their reviews.
    const today = clock.today();
    await tx.update(s.residencies).set({ status: 'declined' }).where(and(eq(s.residencies.userId, user.id), eq(s.residencies.status, 'invited')));
    await tx
      .update(s.residencies)
      .set({ status: 'ended', endDate: sql`greatest(${s.residencies.startDate}, ${today}::date)` })
      .where(and(eq(s.residencies.userId, user.id), eq(s.residencies.status, 'active')));
    await tx
      .update(s.residencies)
      .set({ name: '', phone: '', directoryOptIn: false })
      .where(eq(s.residencies.userId, user.id));
    // Signed out everywhere; login codes and throttles for the phone go too.
    await tx.delete(s.sessions).where(eq(s.sessions.userId, user.id));
    await tx.delete(s.loginHandoffs).where(eq(s.loginHandoffs.userId, user.id));
    await tx.delete(s.otpCodes).where(eq(s.otpCodes.phone, row.phone));
    await tx.delete(s.loginThrottle).where(eq(s.loginThrottle.phone, row.phone));
    // The phone becomes a placeholder no real number matches, so the same number can sign up again as a new person.
    await tx
      .update(s.users)
      .set({ name: '', phone: `deleted:${user.id}`, email: null, passwordHash: null, phoneVerifiedAt: null, deletedAt: clock.now() })
      .where(eq(s.users.id, user.id));
  });
  for (const p of photos) {
    const key = uploadKeyOf(p);
    if (key) await storage.remove(key).catch(() => {});
  }
  return { ok: true as const };
}
