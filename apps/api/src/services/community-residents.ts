/** Residencies: claims, owner-added residents, directory, rent ledger. See personas addendum §2. */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { istDate, newId, type MyCommunity, type ResidencyWithPeople, type schemas } from '@hostels/shared';
import type { z } from 'zod';
import { db, schema } from '../db';
import { err } from '../lib/http';
import { hostelRef, personRef, toResidency } from '../lib/serialize-community';
import type { UserRow } from '../lib/types';
import { getHostel, type ResidencyRow } from './community-access';
import { ownedHostel, requirePro } from './owner-access';
import { hostelSummaries } from './owner-hostel-summaries';

async function hasOpenResidency(userId: string, hostelId: string) {
  const [r] = await db
    .select({ id: schema.residencies.id })
    .from(schema.residencies)
    .where(and(eq(schema.residencies.userId, userId), eq(schema.residencies.hostelId, hostelId), inArray(schema.residencies.status, ['pending', 'active'])));
  return !!r;
}

export async function myResidencies(user: UserRow): Promise<MyCommunity> {
  const rows = await db
    .select()
    .from(schema.residencies)
    .where(eq(schema.residencies.userId, user.id))
    .orderBy(desc(schema.residencies.startDate));
  const hostelIds = [...new Set(rows.map((r) => r.hostelId))];
  const hostels = hostelIds.length ? await db.select().from(schema.hostels).where(inArray(schema.hostels.id, hostelIds)) : [];
  const summaries = await hostelSummaries(hostels);
  return { residencies: rows.map((r) => ({ ...toResidency(r), hostel: summaries.get(r.hostelId)! })) };
}

export async function claimResidency(user: UserRow, input: z.output<typeof schemas.claimResidencyInput>): Promise<ResidencyRow> {
  const hostel = await getHostel(input.hostelId);
  if (hostel.status !== 'live') throw err.notFound('Hostel');
  if (await hasOpenResidency(user.id, hostel.id)) throw err.conflict('conflict', 'You already live here or have a pending request');
  const [r] = await db
    .insert(schema.residencies)
    .values({
      id: newId('res'),
      userId: user.id,
      hostelId: hostel.id,
      source: 'claim',
      status: 'pending',
      startDate: input.startDate,
      roomLabel: input.roomLabel || null,
    })
    .returning();
  return r!;
}

export async function residentDirectory(hostelId: string) {
  const rows = await db
    .select({ r: schema.residencies, u: schema.users })
    .from(schema.residencies)
    .innerJoin(schema.users, eq(schema.users.id, schema.residencies.userId))
    .where(and(eq(schema.residencies.hostelId, hostelId), eq(schema.residencies.status, 'active')))
    .orderBy(asc(schema.residencies.startDate));
  return rows.map(({ r, u }) => ({ id: u.id, name: u.name || 'Resident', since: r.startDate, roomLabel: r.roomLabel }));
}

function withPeople(r: ResidencyRow, u: typeof schema.users.$inferSelect, h: typeof schema.hostels.$inferSelect): ResidencyWithPeople {
  return { ...toResidency(r), user: personRef(u), hostel: hostelRef(h) };
}

export async function ownerResidents(user: UserRow, hostelId: string): Promise<ResidencyWithPeople[]> {
  const h = await ownedHostel(user, hostelId);
  const rows = await db
    .select({ r: schema.residencies, u: schema.users })
    .from(schema.residencies)
    .innerJoin(schema.users, eq(schema.users.id, schema.residencies.userId))
    .where(eq(schema.residencies.hostelId, hostelId))
    .orderBy(desc(schema.residencies.createdAt));
  // Pending claims first, then active, then the rest.
  const rank = { pending: 0, active: 1, ended: 2, rejected: 3 } as const;
  rows.sort((a, b) => rank[a.r.status] - rank[b.r.status]);
  return rows.map(({ r, u }) => withPeople(r, u, h));
}

export async function addResident(user: UserRow, hostelId: string, input: z.output<typeof schemas.ownerAddResidentInput>): Promise<ResidencyWithPeople> {
  const h = await ownedHostel(user, hostelId);
  requirePro(h);
  let [resident] = await db.select().from(schema.users).where(eq(schema.users.phone, input.phone));
  if (!resident) {
    [resident] = await db.insert(schema.users).values({ id: newId('usr'), phone: input.phone, name: input.name, role: 'tenant' }).returning();
  } else if (!resident.name) {
    [resident] = await db.update(schema.users).set({ name: input.name }).where(eq(schema.users.id, resident.id)).returning();
  }
  if (await hasOpenResidency(resident!.id, h.id)) throw err.conflict('conflict', 'This person is already a resident or has a pending request');
  const [r] = await db
    .insert(schema.residencies)
    .values({
      id: newId('res'),
      userId: resident!.id,
      hostelId: h.id,
      source: 'owner',
      status: 'active',
      startDate: input.startDate,
      roomLabel: input.roomLabel || null,
      monthlyRent: input.monthlyRent ?? null,
    })
    .returning();
  return withPeople(r!, resident!, h);
}

async function ownedResidency(user: UserRow, residencyId: string) {
  const [r] = await db.select().from(schema.residencies).where(eq(schema.residencies.id, residencyId));
  if (!r) throw err.notFound('Resident');
  const h = await ownedHostel(user, r.hostelId).catch(() => {
    throw err.notFound('Resident');
  });
  return { r, h };
}

export async function decideResidency(user: UserRow, residencyId: string, input: z.output<typeof schemas.residencyDecisionInput>): Promise<ResidencyRow> {
  const { r } = await ownedResidency(user, residencyId);
  const allowed: Record<string, string[]> = { pending: ['active', 'rejected'], active: ['ended'] };
  if (!allowed[r.status]?.includes(input.status)) throw err.domain('invalid_transition', `Cannot change a ${r.status} residency to ${input.status}`);
  const patch: Partial<typeof schema.residencies.$inferInsert> = { status: input.status };
  if (input.status === 'ended') {
    const endDate = input.endDate ?? istDate();
    if (endDate < r.startDate) throw err.validation('End date is before the start date', [{ path: 'endDate', message: 'Before start date' }]);
    patch.endDate = endDate;
  }
  const [u] = await db.update(schema.residencies).set(patch).where(eq(schema.residencies.id, residencyId)).returning();
  return u!;
}

export async function rentLedger(user: UserRow, residencyId: string) {
  const { h } = await ownedResidency(user, residencyId);
  requirePro(h);
  return db
    .select()
    .from(schema.rentPayments)
    .where(eq(schema.rentPayments.residencyId, residencyId))
    .orderBy(desc(schema.rentPayments.periodMonth), desc(schema.rentPayments.paidOn));
}

export async function recordRent(user: UserRow, residencyId: string, input: z.output<typeof schemas.rentPaymentInput>) {
  const { h } = await ownedResidency(user, residencyId);
  requirePro(h);
  const [p] = await db
    .insert(schema.rentPayments)
    .values({ id: newId('rnt'), residencyId, ...input })
    .returning();
  return p!;
}
