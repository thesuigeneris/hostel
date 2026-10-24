import type { OwnerPlanTier, User } from '@hostels/shared';
import { and, eq } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';
import { AppError, forbidden, notFound } from '../lib/errors';

type HostelRow = typeof schema.hostels.$inferSelect;

/** The hostel, if the user owns it (admins may act on any hostel). Others get 404 so ids don't leak. */
export async function ownedHostel(user: User, hostelId: string, db: Tx = getDb()): Promise<HostelRow> {
  const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  if (!h || (h.ownerId !== user.id && user.role !== 'admin')) throw notFound('Hostel');
  return h;
}

export type PlanState = { plan: OwnerPlanTier; suspended: boolean; effective: OwnerPlanTier };

export async function planFor(hostelId: string, db: Tx = getDb()): Promise<PlanState> {
  const [p] = await db.select().from(schema.ownerPlans).where(eq(schema.ownerPlans.hostelId, hostelId));
  if (!p) return { plan: 'free', suspended: false, effective: 'free' };
  return { plan: p.plan, suspended: p.suspended, effective: p.suspended ? 'free' : p.plan };
}

const RANK: Record<OwnerPlanTier, number> = { free: 0, pro: 1, partner: 2 };

export async function requirePlan(hostelId: string, needed: OwnerPlanTier, db: Tx = getDb()) {
  const state = await planFor(hostelId, db);
  if (RANK[state.effective] < RANK[needed]) {
    throw new AppError(
      'plan_required',
      state.suspended
        ? 'This feature is paused until the overdue platform bill is paid'
        : `This needs the ${needed === 'pro' ? 'Pro' : 'Partner'} plan`,
      402,
    );
  }
  return state;
}

/** A hostel can take subscriptions when it is live, verified, and its owner plan is not suspended. */
export function isBookable(h: HostelRow, plan: PlanState): boolean {
  return h.status === 'live' && h.partnerStatus === 'verified' && !plan.suspended;
}

/** The user's active residency at a hostel, if any. */
export async function activeResidency(userId: string, hostelId: string, db: Tx = getDb()) {
  const r = schema.residencies;
  const [row] = await db
    .select()
    .from(r)
    .where(and(eq(r.userId, userId), eq(r.hostelId, hostelId), eq(r.status, 'active')))
    .limit(1);
  return row ?? null;
}

/** Residents of the hostel, its owner and admins can see its community and issue list. */
export async function requireMember(user: User, hostelId: string, db: Tx = getDb()) {
  const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  if (!h) throw notFound('Hostel');
  if (user.role === 'admin' || h.ownerId === user.id) return { hostel: h, residency: null, isOwner: true };
  const residency = await activeResidency(user.id, hostelId, db);
  if (!residency) throw new AppError('not_a_resident', 'Only current residents of this hostel can do this', 403);
  return { hostel: h, residency, isOwner: false };
}

export async function hostelIdsOwnedBy(ownerId: string, db: Tx = getDb()) {
  const rows = await db.select({ id: schema.hostels.id }).from(schema.hostels).where(eq(schema.hostels.ownerId, ownerId));
  return rows.map((r) => r.id);
}

export function assertOwner(user: User, ownerId: string) {
  if (user.role !== 'admin' && user.id !== ownerId) throw forbidden();
}

