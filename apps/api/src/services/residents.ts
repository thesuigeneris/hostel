import type { User } from '@hostels/shared';
import {
  dateLabel,
  daysBetween,
  newId,
  REVIEW_MIN_STAY_DAYS,
  REVIEW_WINDOW_AFTER_STAY_DAYS,
  type rentRecordSchema,
  type residentInputSchema,
  type reviewInputSchema,
} from '@hostels/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError, notFound } from '../lib/errors';
import { ownedHostel, requirePlan } from './access';

type ResidencyRow = typeof schema.residencies.$inferSelect;
const toResidency = (r: ResidencyRow) => ({ ...r, createdAt: r.createdAt.toISOString() });

/** Owner-added residencies wait for the phone's owner; link them when that phone signs in. */
export async function linkInvitedResidencies(user: User) {
  // An invite is addressed to a phone; only someone who proved they hold that phone may claim it.
  if (!user.phoneVerified) return;
  await getDb()
    .update(schema.residencies)
    .set({ userId: user.id })
    .where(and(eq(schema.residencies.phone, user.phone), isNull(schema.residencies.userId)));
}

// --- resident side -----------------------------------------------------------

export async function myResidencies(user: User) {
  await linkInvitedResidencies(user);
  const rows = await getDb()
    .select({
      residency: schema.residencies,
      hostel: {
        id: schema.hostels.id,
        name: schema.hostels.name,
        slug: schema.hostels.slug,
        area: schema.hostels.area,
        foodAvailable: schema.hostels.foodAvailable,
      },
    })
    .from(schema.residencies)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.residencies.hostelId))
    .where(eq(schema.residencies.userId, user.id))
    .orderBy(desc(schema.residencies.startDate));
  const today = clock.today();
  return Promise.all(
    rows.map(async (r) => {
      const eligibility = reviewEligibility(r.residency, today);
      const review = await myReview(user.id, r.residency.hostelId);
      return {
        ...toResidency(r.residency),
        hostel: r.hostel,
        canReview: eligibility.ok,
        reviewBlockedReason: eligibility.ok ? null : (eligibility.reason ?? null),
        hasReview: !!review,
        // The resident's own review, so the form can be edited in place (including when it was hidden).
        review: review ? { ...toReview(review, { name: user.name, residency: r.residency }), hiddenReason: review.hiddenReason } : null,
      };
    }),
  );
}

async function mine(user: User, residencyId: string) {
  const [r] = await getDb().select().from(schema.residencies).where(eq(schema.residencies.id, residencyId));
  if (!r || r.userId !== user.id) throw notFound('Residency');
  return r;
}

export async function respondToInvite(user: User, residencyId: string, accept: boolean) {
  const r = await mine(user, residencyId);
  if (r.status !== 'invited') throw new AppError('invalid_state', 'This invitation was already answered');
  const [row] = await getDb()
    .update(schema.residencies)
    .set({ status: accept ? 'active' : 'declined', name: r.name || user.name })
    .where(eq(schema.residencies.id, r.id))
    .returning();
  return toResidency(row!);
}

/** Residents can say they moved out of an owner-added stay. Subscription stays end through cancel or move. */
export async function moveOut(user: User, residencyId: string) {
  const r = await mine(user, residencyId);
  if (r.status !== 'active') throw new AppError('invalid_state', 'This stay is not active');
  if (r.source === 'subscription') throw new AppError('invalid_state', 'Cancel or move your plan to leave this hostel');
  const [row] = await getDb()
    .update(schema.residencies)
    .set({ status: 'ended', endDate: clock.today() })
    .where(eq(schema.residencies.id, r.id))
    .returning();
  return toResidency(row!);
}

export async function setDirectoryOptIn(user: User, residencyId: string, directoryOptIn: boolean) {
  const r = await mine(user, residencyId);
  const [row] = await getDb().update(schema.residencies).set({ directoryOptIn }).where(eq(schema.residencies.id, r.id)).returning();
  return toResidency(row!);
}

export async function residentDirectory(hostelId: string) {
  const rows = await getDb()
    .select({ name: schema.residencies.name, userName: schema.users.name, sharing: schema.roomTypes.sharing, since: schema.residencies.startDate })
    .from(schema.residencies)
    .innerJoin(schema.users, eq(schema.users.id, schema.residencies.userId))
    .leftJoin(schema.roomTypes, eq(schema.roomTypes.id, schema.residencies.roomTypeId))
    .where(and(eq(schema.residencies.hostelId, hostelId), eq(schema.residencies.status, 'active'), eq(schema.residencies.directoryOptIn, true)))
    .orderBy(asc(schema.residencies.startDate));
  // Names and room types only; phone numbers never leave the owner view.
  return rows.map((r) => ({ name: r.userName || r.name || 'Resident', sharing: r.sharing, since: r.since }));
}

// --- owner roster ------------------------------------------------------------

export async function roster(user: User, hostelId: string) {
  const h = await ownedHostel(user, hostelId);
  const rows = await getDb()
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.hostelId, h.id), inArray(schema.residencies.status, ['invited', 'active'])))
    .orderBy(asc(schema.residencies.startDate));
  return rows.map(toResidency);
}

export async function addResident(user: User, hostelId: string, input: z.output<typeof residentInputSchema>) {
  const h = await ownedHostel(user, hostelId);
  await requirePlan(h.id, 'pro');
  const db = getDb();
  if (input.roomTypeId) {
    const [room] = await db
      .select()
      .from(schema.roomTypes)
      .where(and(eq(schema.roomTypes.id, input.roomTypeId), eq(schema.roomTypes.hostelId, h.id)));
    if (!room) throw notFound('Room type');
  }
  const [existing] = await db
    .select()
    .from(schema.residencies)
    .where(
      and(
        eq(schema.residencies.hostelId, h.id),
        eq(schema.residencies.phone, input.phone),
        inArray(schema.residencies.status, ['invited', 'active']),
      ),
    );
  if (existing) throw onRoster();
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.phone, input.phone));
  if (owner?.id === h.ownerId) throw new AppError('invalid_state', 'You cannot add yourself as a resident');
  // The check above can't see an invite being added at the same moment (a double tap); the unique index can.
  const [row] = await db
    .insert(schema.residencies)
    .values({
      id: newId('res'),
      userId: owner?.id ?? null,
      phone: input.phone,
      name: input.name,
      hostelId: h.id,
      roomTypeId: input.roomTypeId ?? null,
      source: 'owner',
      monthlyRent: input.monthlyRent,
      startDate: input.startDate,
      status: 'invited',
    })
    .returning()
    .catch((e) => {
      throw isUniqueViolation(e, 'residencies_one_open_owner_stay') ? onRoster() : e;
    });
  return toResidency(row!);
}

const onRoster = () => new AppError('invalid_state', 'This phone is already on your roster');

/**
 * Ends an owner-added stay. A move-out date after today keeps the stay active (the resident keeps access) until that
 * date, when `endDueResidencies` ends it; the roster shows "Leaving on …" meanwhile. An unanswered invite is withdrawn.
 * Each change is conditional on the status read here, so a resident moving out at the same moment wins or loses whole.
 */
export async function endResident(user: User, hostelId: string, residencyId: string, endDate: string) {
  const h = await ownedHostel(user, hostelId);
  const db = getDb();
  const r = schema.residencies;
  const [row] = await db.select().from(r).where(and(eq(r.id, residencyId), eq(r.hostelId, h.id)));
  if (!row) throw notFound('Resident');
  if (row.source === 'subscription') throw new AppError('invalid_state', 'Subscriber stays end when their plan ends or moves');
  if (row.status === 'ended' || row.status === 'declined') return toResidency(row);
  if (row.status === 'active' && endDate < row.startDate) {
    throw new AppError('validation', `The move-out date is before they moved in (${dateLabel(row.startDate)})`, 400, [
      { path: 'endDate', message: 'Pick a date on or after the start date' },
    ]);
  }
  const set = row.status === 'invited' ? { status: 'declined' as const } : endDate <= clock.today() ? { status: 'ended' as const, endDate } : { endDate };
  const [updated] = await db
    .update(r)
    .set(set)
    .where(and(eq(r.id, row.id), eq(r.status, row.status)))
    .returning();
  if (!updated) throw new AppError('invalid_state', 'This stay just changed. Refresh to see where it stands.');
  return toResidency(updated);
}

/** Job: owner-added stays whose move-out date has come end today. */
export async function endDueResidencies(today = clock.today()) {
  const r = schema.residencies;
  const rows = await getDb()
    .update(r)
    .set({ status: 'ended' })
    .where(and(eq(r.source, 'owner'), eq(r.status, 'active'), isNotNull(r.endDate), lte(r.endDate, today)))
    .returning({ id: r.id });
  return rows.length;
}


// --- rent tracker ------------------------------------------------------------

export async function rentSheet(user: User, hostelId: string, month: string) {
  const h = await ownedHostel(user, hostelId);
  await requirePlan(h.id, 'pro');
  const db = getDb();
  const monthStart = `${month}-01`;
  const residents = await db
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.hostelId, h.id), eq(schema.residencies.source, 'owner'), inArray(schema.residencies.status, ['invited', 'active', 'ended'])));
  const inMonth = residents.filter((r) => r.startDate.slice(0, 7) <= month && (!r.endDate || r.endDate >= monthStart));
  const records = inMonth.length
    ? await db
        .select()
        .from(schema.rentRecords)
        .where(and(eq(schema.rentRecords.month, month), inArray(schema.rentRecords.residencyId, inMonth.map((r) => r.id))))
    : [];
  const rows = inMonth.map((r) => {
    const rec = records.find((x) => x.residencyId === r.id);
    const amountDue = rec?.amountDue ?? r.monthlyRent ?? 0;
    const amountPaid = rec?.amountPaid ?? 0;
    return {
      residencyId: r.id,
      name: r.name,
      phone: r.phone,
      amountDue,
      amountPaid,
      paidOn: rec?.paidOn ?? null,
      method: rec?.method ?? null,
      note: rec?.note ?? '',
      status: amountPaid >= amountDue ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
    };
  });
  return {
    month,
    rows,
    totals: {
      due: rows.reduce((s, r) => s + r.amountDue, 0),
      collected: rows.reduce((s, r) => s + r.amountPaid, 0),
      unpaid: rows.filter((r) => r.status !== 'paid').length,
    },
  };
}

export async function recordRent(user: User, hostelId: string, residencyId: string, input: z.output<typeof rentRecordSchema>) {
  const h = await ownedHostel(user, hostelId);
  await requirePlan(h.id, 'pro');
  const db = getDb();
  const [r] = await db
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.id, residencyId), eq(schema.residencies.hostelId, h.id), eq(schema.residencies.source, 'owner')));
  if (!r) throw notFound('Resident');
  const values = {
    amountDue: input.amountDue ?? r.monthlyRent ?? 0,
    amountPaid: input.amountPaid,
    paidOn: input.paidOn ?? (input.amountPaid > 0 ? clock.today() : null),
    method: input.method ?? null,
    note: input.note,
  };
  const [row] = await db
    .insert(schema.rentRecords)
    .values({ id: newId('rnt'), residencyId: r.id, month: input.month, ...values })
    .onConflictDoUpdate({ target: [schema.rentRecords.residencyId, schema.rentRecords.month], set: values })
    .returning();
  return { ...row!, createdAt: row!.createdAt.toISOString() };
}

// --- reviews -----------------------------------------------------------------

export function reviewEligibility(r: ResidencyRow, today: string): { ok: boolean; reason?: string } {
  if (r.status === 'active') {
    const days = daysBetween(r.startDate, today);
    return days >= REVIEW_MIN_STAY_DAYS
      ? { ok: true }
      : { ok: false, reason: `You can review after ${REVIEW_MIN_STAY_DAYS} days here (${REVIEW_MIN_STAY_DAYS - days} to go)` };
  }
  if (r.status === 'ended' && r.endDate) {
    if (daysBetween(r.startDate, r.endDate) + 1 < REVIEW_MIN_STAY_DAYS) return { ok: false, reason: 'Your stay was too short to review' };
    return daysBetween(r.endDate, today) <= REVIEW_WINDOW_AFTER_STAY_DAYS
      ? { ok: true }
      : { ok: false, reason: 'Reviews are open for 180 days after you move out' };
  }
  return { ok: false, reason: 'Only residents can review this hostel' };
}

async function myReview(userId: string, hostelId: string) {
  const [row] = await getDb()
    .select()
    .from(schema.reviews)
    .where(and(eq(schema.reviews.userId, userId), eq(schema.reviews.hostelId, hostelId)));
  return row ?? null;
}

/** Creates or edits the user's one review of a hostel, which needs a qualifying residency there. */
export async function upsertReview(user: User, hostelId: string, input: z.output<typeof reviewInputSchema>) {
  const db = getDb();
  const [hostel] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  if (!hostel) throw notFound('Hostel');
  const stays = await db
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.userId, user.id), eq(schema.residencies.hostelId, hostelId)))
    .orderBy(desc(schema.residencies.startDate));
  const today = clock.today();
  const checks = stays.map((s) => ({ s, e: reviewEligibility(s, today) }));
  const qualifying = checks.find((c) => c.e.ok)?.s;
  if (!qualifying) {
    throw new AppError('review_not_allowed', checks[0]?.e.reason ?? 'Only verified residents of this hostel can review it', 403);
  }
  const values = {
    rating: input.rating,
    cleanliness: input.cleanliness,
    food: hostel.foodAvailable ? (input.food ?? null) : null,
    safety: input.safety,
    responsiveness: input.responsiveness,
    body: input.body,
  };
  try {
    const [row] = await db
      .insert(schema.reviews)
      .values({ id: newId('rev'), hostelId, userId: user.id, residencyId: qualifying.id, ...values })
      .onConflictDoUpdate({
        target: [schema.reviews.hostelId, schema.reviews.userId],
        set: { ...values, residencyId: qualifying.id, updatedAt: clock.now() },
      })
      .returning();
    return toReview(row!, { name: user.name, residency: qualifying });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError('invalid_state', 'Review already exists');
    throw e;
  }
}

function toReview(r: typeof schema.reviews.$inferSelect, extra: { name: string; residency: ResidencyRow | null }) {
  return {
    id: r.id,
    hostelId: r.hostelId,
    rating: r.rating,
    cleanliness: r.cleanliness,
    food: r.food,
    safety: r.safety,
    responsiveness: r.responsiveness,
    body: r.body,
    ownerReply: r.ownerReply,
    ownerRepliedAt: r.ownerRepliedAt?.toISOString() ?? null,
    ownerReplyEditedAt: r.ownerReplyEditedAt?.toISOString() ?? null,
    hidden: r.hidden,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    author: firstNameAndInitial(extra.name),
    verifiedVia: extra.residency?.source ?? null,
    stay: extra.residency ? { from: extra.residency.startDate, to: extra.residency.endDate } : null,
  };
}

function firstNameAndInitial(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Resident';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0]!;
}

export async function hostelReviews(hostelId: string, opts: { includeHidden?: boolean; page?: number } = {}) {
  const limit = 20;
  const offset = ((opts.page ?? 1) - 1) * limit;
  const rows = await getDb()
    .select({ review: schema.reviews, name: schema.users.name, residency: schema.residencies })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
    .leftJoin(schema.residencies, eq(schema.residencies.id, schema.reviews.residencyId))
    .where(and(eq(schema.reviews.hostelId, hostelId), opts.includeHidden ? undefined : eq(schema.reviews.hidden, false)))
    .orderBy(desc(schema.reviews.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => toReview(r.review, { name: r.name, residency: r.residency }));
}

/** The owner's reviews, unreplied first, 20 a page. Hidden ones are included so the owner sees what moderators hid. */
export async function ownerReviews(user: User, hostelId: string, page = 1) {
  const h = await ownedHostel(user, hostelId);
  const limit = 20;
  const rows = await getDb()
    .select({ review: schema.reviews, name: schema.users.name, residency: schema.residencies })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
    .leftJoin(schema.residencies, eq(schema.residencies.id, schema.reviews.residencyId))
    .where(eq(schema.reviews.hostelId, h.id))
    .orderBy(sql`${schema.reviews.ownerReply} is null desc`, desc(schema.reviews.createdAt), desc(schema.reviews.id))
    .limit(limit)
    .offset((page - 1) * limit);
  return rows.map((r) => toReview(r.review, { name: r.name, residency: r.residency }));
}

/** One review as the lists show it, wherever it sits in them. */
async function reviewView(reviewId: string) {
  const [r] = await getDb()
    .select({ review: schema.reviews, name: schema.users.name, residency: schema.residencies })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
    .leftJoin(schema.residencies, eq(schema.residencies.id, schema.reviews.residencyId))
    .where(eq(schema.reviews.id, reviewId));
  if (!r) throw notFound('Review');
  return toReview(r.review, { name: r.name, residency: r.residency });
}

/** A review of a hostel the caller owns (404 otherwise); replying is part of Pro. */
async function reviewToAnswer(user: User, reviewId: string) {
  const [review] = await getDb().select().from(schema.reviews).where(eq(schema.reviews.id, reviewId));
  if (!review) throw notFound('Review');
  const h = await ownedHostel(user, review.hostelId);
  await requirePlan(h.id, 'pro');
  return review;
}

/** The owner's one public reply. One conditional update, so a double tap posts once and the second is told. */
export async function replyToReview(user: User, reviewId: string, reply: string) {
  const review = await reviewToAnswer(user, reviewId);
  const r = schema.reviews;
  const [done] = await getDb()
    .update(r)
    .set({ ownerReply: reply, ownerRepliedAt: clock.now() })
    .where(and(eq(r.id, review.id), isNull(r.ownerReply)))
    .returning({ id: r.id });
  if (!done) throw new AppError('invalid_state', 'You have already replied to this review. Refresh to see your reply; you can edit it there.');
  return reviewView(review.id);
}

/** Changes the owner's reply. The review then says it was edited, and when; resending the same words changes nothing. */
export async function editReviewReply(user: User, reviewId: string, reply: string) {
  const review = await reviewToAnswer(user, reviewId);
  const r = schema.reviews;
  const now = clock.now();
  const [done] = await getDb()
    .update(r)
    .set({ ownerReply: reply, ownerReplyEditedAt: sql`case when ${r.ownerReply} = ${reply} then ${r.ownerReplyEditedAt} else ${now.toISOString()}::timestamptz end` })
    .where(and(eq(r.id, review.id), isNotNull(r.ownerReply)))
    .returning({ id: r.id });
  if (!done) throw new AppError('invalid_state', 'There is no reply to edit yet. Post one first.');
  return reviewView(review.id);
}

export async function flagReview(user: User, reviewId: string, reason: string) {
  const db = getDb();
  const [review] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, reviewId));
  if (!review || review.hidden) throw notFound('Review');
  await db.insert(schema.reviewFlags).values({ id: newId('flg'), reviewId, userId: user.id, reason }).onConflictDoNothing();
  return { ok: true as const };
}

export async function moderateReview(reviewId: string, hidden: boolean, reason?: string) {
  const db = getDb();
  const [row] = await db
    .update(schema.reviews)
    .set({ hidden, hiddenReason: hidden ? (reason ?? null) : null })
    .where(eq(schema.reviews.id, reviewId))
    .returning();
  if (!row) throw notFound('Review');
  await db.update(schema.reviewFlags).set({ resolved: true }).where(eq(schema.reviewFlags.reviewId, reviewId));
  return row;
}

export async function flaggedReviews() {
  return getDb()
    .select({
      review: schema.reviews,
      hostelName: schema.hostels.name,
      flags: sql<number>`count(${schema.reviewFlags.id})::int`,
      reasons: sql<string[]>`array_agg(${schema.reviewFlags.reason})`,
    })
    .from(schema.reviewFlags)
    .innerJoin(schema.reviews, eq(schema.reviews.id, schema.reviewFlags.reviewId))
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.reviews.hostelId))
    .where(eq(schema.reviewFlags.resolved, false))
    .groupBy(schema.reviews.id, schema.hostels.name);
}

