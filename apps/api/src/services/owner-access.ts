/** Ownership and plan guards shared by owner routes. */
import { eq } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '../db';
import { err } from '../lib/http';
import type { UserRow } from '../lib/types';

export type HostelRow = typeof schema.hostels.$inferSelect;

export function ownsHostel(user: Pick<UserRow, 'id' | 'role'>, hostel: Pick<HostelRow, 'ownerId'>): boolean {
  return user.role === 'admin' || hostel.ownerId === user.id;
}

/** The hostel if `user` owns it (or is admin); 404 otherwise so ids of others' hostels don't leak. */
export async function ownedHostel(user: UserRow, hostelId: string, tx: DbOrTx = db): Promise<HostelRow> {
  const [h] = await tx.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  if (!h || !ownsHostel(user, h)) throw err.notFound('Hostel');
  return h;
}

export function requirePro(hostel: HostelRow) {
  if (hostel.ownerPlan !== 'pro') throw err.domain('plan_required', 'This is a Hostels Pro feature. Upgrade the hostel to use it.', 402);
}

export function requireVerified(hostel: HostelRow) {
  if (hostel.partnerStatus !== 'verified') throw err.domain('not_verified', 'Only verified partner hostels can use this', 403);
}
