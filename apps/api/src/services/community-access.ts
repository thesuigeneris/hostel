/** Who may see and act on a hostel's community board and issues. See personas addendum §2–5. */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { err } from '../lib/http';
import type { UserRow } from '../lib/types';
import type { HostelRow } from './owner-access';

export type ResidencyRow = typeof schema.residencies.$inferSelect;

export async function getHostel(hostelId: string): Promise<HostelRow> {
  const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
  if (!h) throw err.notFound('Hostel');
  return h;
}

export async function activeResidency(userId: string, hostelId: string): Promise<ResidencyRow | undefined> {
  const [r] = await db
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.userId, userId), eq(schema.residencies.hostelId, hostelId), eq(schema.residencies.status, 'active')));
  return r;
}

/** Most recent active-or-ended residency; that is what makes someone eligible to review. */
export async function reviewableResidency(userId: string, hostelId: string): Promise<ResidencyRow | undefined> {
  const [r] = await db
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.userId, userId), eq(schema.residencies.hostelId, hostelId), inArray(schema.residencies.status, ['active', 'ended'])))
    .orderBy(desc(schema.residencies.startDate));
  return r;
}

export type BoardRole = 'resident' | 'owner' | 'admin';

/** The viewer's role on this hostel's board, or null if they have no access. */
export async function boardRole(user: UserRow, hostel: HostelRow): Promise<BoardRole | null> {
  if (user.role === 'admin') return 'admin';
  if (hostel.ownerId === user.id) return 'owner';
  return (await activeResidency(user.id, hostel.id)) ? 'resident' : null;
}

/** Throws `not_resident` (403) unless the user is an active resident, the owner, or an admin. */
export async function requireBoard(user: UserRow, hostel: HostelRow): Promise<BoardRole> {
  const role = await boardRole(user, hostel);
  if (!role) throw err.domain('not_resident', 'Only residents of this hostel can see this', 403);
  return role;
}

export async function requireActiveResident(user: UserRow, hostelId: string): Promise<ResidencyRow> {
  const r = await activeResidency(user.id, hostelId);
  if (!r) throw err.domain('not_resident', 'Only current residents of this hostel can do this', 403);
  return r;
}
