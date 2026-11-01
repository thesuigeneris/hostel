import type { User, VisitStatus } from '@hostels/shared';
import { newId, visitDateProblem } from '@hostels/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError, notFound } from '../lib/errors';
import { hostelIdsOwnedBy, ownedHostel } from './access';

const toVisit = (v: typeof schema.visitRequests.$inferSelect) => ({ ...v, createdAt: v.createdAt.toISOString() });

const alreadyWaiting = () => new AppError('invalid_state', 'You already have a visit request waiting at this hostel');

export async function requestVisit(user: User, hostelId: string, input: { preferredDate: string; message: string }) {
  const db = getDb();
  const [h] = await db.select().from(schema.hostels).where(and(eq(schema.hostels.id, hostelId), eq(schema.hostels.status, 'live')));
  if (!h) throw notFound('Hostel');
  if (h.ownerId === user.id) throw new AppError('invalid_state', 'This is your own hostel, so there is no visit to request.');
  const problem = visitDateProblem(input.preferredDate, clock.today());
  if (problem) throw new AppError('validation', problem, 400);
  const [open] = await db
    .select({ id: schema.visitRequests.id })
    .from(schema.visitRequests)
    .where(and(eq(schema.visitRequests.hostelId, h.id), eq(schema.visitRequests.userId, user.id), eq(schema.visitRequests.status, 'new')));
  if (open) throw alreadyWaiting();
  try {
    const [row] = await db
      .insert(schema.visitRequests)
      .values({ id: newId('vis'), hostelId: h.id, userId: user.id, ...input, createdAt: clock.now() })
      .returning();
    return toVisit(row!);
  } catch (e) {
    // A double-submitted form: both requests passed the check above, and the partial unique index lets one in.
    if (isUniqueViolation(e, 'visit_requests_one_open')) throw alreadyWaiting();
    throw e;
  }
}

export async function myVisits(user: User) {
  const rows = await getDb()
    .select({ visit: schema.visitRequests, hostel: { name: schema.hostels.name, slug: schema.hostels.slug } })
    .from(schema.visitRequests)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.visitRequests.hostelId))
    .where(eq(schema.visitRequests.userId, user.id))
    .orderBy(desc(schema.visitRequests.createdAt));
  return rows.map((r) => ({ ...toVisit(r.visit), hostel: r.hostel }));
}

/** A seeker withdraws a visit request the hostel has not acted on yet. */
export async function cancelVisit(user: User, visitId: string) {
  const db = getDb();
  const [v] = await db.select().from(schema.visitRequests).where(eq(schema.visitRequests.id, visitId));
  if (!v || v.userId !== user.id) throw notFound('Visit request');
  // Conditional on status, so a hostel reply landing at the same moment wins and the seeker is told.
  const [row] = await db
    .update(schema.visitRequests)
    .set({ status: 'closed' })
    .where(and(eq(schema.visitRequests.id, v.id), eq(schema.visitRequests.status, 'new')))
    .returning();
  if (!row) throw new AppError('invalid_state', 'The hostel has already responded to this request');
  return toVisit(row);
}

export async function ownerVisits(user: User, status?: VisitStatus) {
  const ids = await hostelIdsOwnedBy(user.id);
  if (!ids.length) return [];
  const rows = await getDb()
    .select({
      visit: schema.visitRequests,
      hostelName: schema.hostels.name,
      visitor: { name: schema.users.name, phone: schema.users.phone },
    })
    .from(schema.visitRequests)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.visitRequests.hostelId))
    .innerJoin(schema.users, eq(schema.users.id, schema.visitRequests.userId))
    .where(and(inArray(schema.visitRequests.hostelId, ids), status ? eq(schema.visitRequests.status, status) : undefined))
    .orderBy(desc(schema.visitRequests.createdAt));
  return rows.map((r) => ({ ...toVisit(r.visit), hostelName: r.hostelName, visitor: r.visitor }));
}

export async function setVisitStatus(user: User, visitId: string, status: VisitStatus) {
  const db = getDb();
  const [v] = await db.select().from(schema.visitRequests).where(eq(schema.visitRequests.id, visitId));
  if (!v) throw notFound('Visit request');
  await ownedHostel(user, v.hostelId);
  const [row] = await db.update(schema.visitRequests).set({ status }).where(eq(schema.visitRequests.id, v.id)).returning();
  return toVisit(row!);
}
