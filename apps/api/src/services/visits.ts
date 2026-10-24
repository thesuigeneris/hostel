import type { User, VisitStatus } from '@hostels/shared';
import { newId } from '@hostels/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { AppError, notFound } from '../lib/errors';
import { hostelIdsOwnedBy, ownedHostel } from './access';

const toVisit = (v: typeof schema.visitRequests.$inferSelect) => ({ ...v, createdAt: v.createdAt.toISOString() });

export async function requestVisit(user: User, hostelId: string, input: { preferredDate: string; message: string }) {
  const db = getDb();
  const [h] = await db.select().from(schema.hostels).where(and(eq(schema.hostels.id, hostelId), eq(schema.hostels.status, 'live')));
  if (!h) throw notFound('Hostel');
  if (input.preferredDate < clock.today()) throw new AppError('validation', 'Pick today or a later date', 400);
  const [open] = await db
    .select({ id: schema.visitRequests.id })
    .from(schema.visitRequests)
    .where(and(eq(schema.visitRequests.hostelId, h.id), eq(schema.visitRequests.userId, user.id), eq(schema.visitRequests.status, 'new')));
  if (open) throw new AppError('invalid_state', 'You already have a visit request waiting at this hostel');
  const [row] = await db
    .insert(schema.visitRequests)
    .values({ id: newId('vis'), hostelId: h.id, userId: user.id, ...input, createdAt: clock.now() })
    .returning();
  return toVisit(row!);
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
