/**
 * Row → DTO mappers for owner, community and admin routes. Shapes match `@hostels/shared` schemas.
 */
import { isOverdue } from '@hostels/shared';
import type * as T from '@hostels/shared';
import type { schema } from '../db';
import { iso, isoOrNull, toPublicUser } from './serialize';

type Row<K extends keyof typeof schema> = (typeof schema)[K] extends { $inferSelect: infer R } ? R : never;
type Person = Pick<Row<'users'>, 'id' | 'name' | 'phone'>;
type HostelRef = Pick<Row<'hostels'>, 'id' | 'name' | 'slug'>;
type Viewer = Pick<Row<'users'>, 'id' | 'role'>;

export const hostelRef = (h: HostelRef) => ({ id: h.id, name: h.name, slug: h.slug });
export const personRef = (u: Person) => ({ id: u.id, name: u.name, phone: u.phone });

export function toVisit(v: Row<'visitRequests'>): T.VisitRequest {
  return { id: v.id, hostelId: v.hostelId, userId: v.userId, preferredDate: v.preferredDate, message: v.message, status: v.status, createdAt: iso(v.createdAt) };
}

export function toFoodPartner(f: Row<'foodPartners'>): T.FoodPartner {
  return { id: f.id, name: f.name, cuisine: f.cuisine, logoUrl: f.logoUrl, active: f.active };
}

export function toSubscriptionDto(s: Row<'subscriptions'>): T.Subscription {
  return {
    id: s.id,
    userId: s.userId,
    hostelId: s.hostelId,
    roomTypeId: s.roomTypeId,
    mealPlan: s.mealPlan,
    diet: s.diet,
    status: s.status,
    startDate: s.startDate,
    cancelAt: s.cancelAt,
    createdAt: iso(s.createdAt),
  };
}

export function toInvoiceDto(i: Row<'invoices'>, today?: string): T.Invoice {
  return {
    id: i.id,
    subscriptionId: i.subscriptionId,
    userId: i.userId,
    hostelId: i.hostelId,
    periodStart: i.periodStart,
    periodEnd: i.periodEnd,
    rentAmount: i.rentAmount,
    foodAmount: i.foodAmount,
    creditAmount: i.creditAmount,
    totalAmount: i.totalAmount,
    status: i.status,
    dueDate: i.dueDate,
    overdue: i.status === 'due' && isOverdue(i.dueDate, today),
    razorpayOrderId: i.razorpayOrderId,
    paidAt: isoOrNull(i.paidAt),
  };
}

export function toMoveDto(m: Row<'moveRequests'>): T.MoveRequest {
  return {
    id: m.id,
    subscriptionId: m.subscriptionId,
    fromHostelId: m.fromHostelId,
    fromRoomTypeId: m.fromRoomTypeId,
    toHostelId: m.toHostelId,
    toRoomTypeId: m.toRoomTypeId,
    moveDate: m.moveDate,
    status: m.status,
    createdAt: iso(m.createdAt),
  };
}

export function toPayout(p: Row<'payouts'>): T.Payout {
  return {
    id: p.id,
    ownerId: p.ownerId,
    hostelId: p.hostelId,
    periodMonth: p.periodMonth,
    grossAmount: p.grossAmount,
    platformFee: p.platformFee,
    netAmount: p.netAmount,
    status: p.status,
    paidAt: isoOrNull(p.paidAt),
  };
}

export function toSaasInvoice(s: Row<'saasInvoices'>): T.SaasInvoice {
  return {
    id: s.id,
    hostelId: s.hostelId,
    ownerId: s.ownerId,
    plan: s.plan,
    periodMonth: s.periodMonth,
    amount: s.amount,
    status: s.status,
    dueDate: s.dueDate,
    razorpayOrderId: s.razorpayOrderId,
    paidAt: isoOrNull(s.paidAt),
  };
}

export function toResidency(r: Row<'residencies'>): T.Residency {
  return {
    id: r.id,
    userId: r.userId,
    hostelId: r.hostelId,
    roomLabel: r.roomLabel,
    source: r.source,
    status: r.status,
    startDate: r.startDate,
    endDate: r.endDate,
    monthlyRent: r.monthlyRent,
    createdAt: iso(r.createdAt),
  };
}

export function toRentPayment(p: Row<'rentPayments'>): T.RentPayment {
  return { id: p.id, residencyId: p.residencyId, periodMonth: p.periodMonth, amount: p.amount, paidOn: p.paidOn, note: p.note };
}

export function toReview(
  r: Row<'reviews'>,
  author: Pick<Row<'users'>, 'id' | 'name'>,
  stay: { startDate: string; endDate: string | null } | null,
): T.Review {
  return {
    id: r.id,
    hostelId: r.hostelId,
    author: toPublicUser(author),
    verifiedResident: true,
    stayedFrom: stay?.startDate ?? null,
    stayedTo: stay?.endDate ?? null,
    overall: r.overall,
    food: r.food,
    cleanliness: r.cleanliness,
    safety: r.safety,
    value: r.value,
    staff: r.staff,
    title: r.title,
    body: r.body,
    ownerReply: r.ownerReply,
    ownerRepliedAt: isoOrNull(r.ownerRepliedAt),
    status: r.status,
    createdAt: iso(r.createdAt),
  };
}

/** Anonymous reporters are only revealed to themselves and admins. */
export function canSeeReporter(issue: Pick<Row<'issues'>, 'anonymous' | 'reporterId'>, viewer: Viewer | null): boolean {
  if (!issue.anonymous) return true;
  return !!viewer && (viewer.role === 'admin' || viewer.id === issue.reporterId);
}

export function toIssue(
  i: Row<'issues'>,
  reporter: Pick<Row<'users'>, 'id' | 'name'>,
  opts: { viewer: Viewer | null; upvotes: number; upvotedByMe: boolean; hideReporter?: boolean },
): T.Issue {
  const showReporter = !opts.hideReporter && canSeeReporter(i, opts.viewer);
  return {
    id: i.id,
    hostelId: i.hostelId,
    reporter: showReporter ? toPublicUser(reporter) : null,
    anonymous: i.anonymous,
    isPublic: i.isPublic,
    category: i.category,
    severity: i.severity,
    title: i.title,
    description: i.description,
    photoUrls: i.photoUrls,
    status: i.status,
    upvotes: opts.upvotes,
    upvotedByMe: opts.upvotedByMe,
    acknowledgedAt: isoOrNull(i.acknowledgedAt),
    resolvedAt: isoOrNull(i.resolvedAt),
    closedAt: isoOrNull(i.closedAt),
    createdAt: iso(i.createdAt),
  };
}

export function toIssueComment(c: Row<'issueComments'>, author: Pick<Row<'users'>, 'id' | 'name' | 'role'>, hostelOwnerId: string): T.IssueComment {
  return {
    id: c.id,
    issueId: c.issueId,
    author: { ...toPublicUser(author), role: author.role },
    isOwner: author.id === hostelOwnerId,
    body: c.body,
    createdAt: iso(c.createdAt),
  };
}

export function toPostComment(c: Row<'postComments'>, author: Pick<Row<'users'>, 'id' | 'name'>): T.PostComment {
  return { id: c.id, postId: c.postId, author: toPublicUser(author), body: c.body, createdAt: iso(c.createdAt) };
}

export function toPost(
  p: Row<'posts'>,
  author: Pick<Row<'users'>, 'id' | 'name' | 'role'>,
  counts: { likes: number; likedByMe: boolean; commentCount: number },
): T.Post {
  return {
    id: p.id,
    hostelId: p.hostelId,
    author: { ...toPublicUser(author), role: author.role },
    kind: p.kind,
    body: p.body,
    pinned: p.pinned,
    likes: counts.likes,
    likedByMe: counts.likedByMe,
    commentCount: counts.commentCount,
    createdAt: iso(p.createdAt),
  };
}
