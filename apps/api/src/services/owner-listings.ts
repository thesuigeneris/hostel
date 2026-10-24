/** Owner listing management: hostels, rooms, photos, partner application. */
import { and, asc, count, desc, eq, inArray, like, or } from 'drizzle-orm';
import { newId, type HostelDetail, type schemas } from '@hostels/shared';
import type { z } from 'zod';
import { db, schema } from '../db';
import { err } from '../lib/http';
import { toHostel, toPhoto, toRoomType } from '../lib/serialize';
import type { UserRow } from '../lib/types';
import { ownedHostel, type HostelRow } from './owner-access';
import { issueStats, ratingSummary } from './reputation';

type HostelInput = z.output<typeof schemas.hostelInput>;
type HostelUpdate = z.output<typeof schemas.hostelUpdateInput>;

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/** `name-area`, suffixed with -2, -3… until unique. */
export async function uniqueSlug(name: string, area: string): Promise<string> {
  const base = slugify(name.toLowerCase().includes(area.toLowerCase()) ? name : `${name} ${area}`) || 'hostel';
  const taken = await db
    .select({ slug: schema.hostels.slug })
    .from(schema.hostels)
    .where(or(eq(schema.hostels.slug, base), like(schema.hostels.slug, `${base}-%`)));
  const set = new Set(taken.map((t) => t.slug));
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
}

export async function listOwnerHostels(user: UserRow): Promise<HostelRow[]> {
  return db.select().from(schema.hostels).where(eq(schema.hostels.ownerId, user.id)).orderBy(desc(schema.hostels.createdAt));
}

export async function createHostel(user: UserRow, input: HostelInput): Promise<HostelRow> {
  const slug = await uniqueSlug(input.name, input.area);
  const [h] = await db
    .insert(schema.hostels)
    .values({ id: newId('hst'), ownerId: user.id, slug, ...input, whatsappPhone: input.whatsappPhone ?? null, status: 'draft' })
    .returning();
  return h!;
}

export async function updateHostel(user: UserRow, id: string, input: HostelUpdate): Promise<HostelRow> {
  const h = await ownedHostel(user, id);
  const patch: Partial<typeof schema.hostels.$inferInsert> = { ...input };
  // A rejected listing goes back to draft when edited so it can be resubmitted.
  if (h.status === 'rejected') patch.status = 'draft';
  if (Object.keys(patch).length === 0) return h;
  const [u] = await db.update(schema.hostels).set(patch).where(eq(schema.hostels.id, id)).returning();
  return u!;
}

export async function hostelDetail(h: HostelRow): Promise<HostelDetail> {
  const [photos, rooms, rating, stats] = await Promise.all([
    db.select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, h.id)).orderBy(asc(schema.hostelPhotos.sortOrder)),
    db.select().from(schema.roomTypes).where(eq(schema.roomTypes.hostelId, h.id)).orderBy(asc(schema.roomTypes.monthlyRent)),
    ratingSummary(h.id),
    issueStats(h.id),
  ]);
  return { ...toHostel(h), photos: photos.map(toPhoto), roomTypes: rooms.map(toRoomType), rating, issueStats: stats };
}

export async function submitHostel(user: UserRow, id: string): Promise<HostelRow> {
  const h = await ownedHostel(user, id);
  if (h.status !== 'draft' && h.status !== 'rejected') throw err.domain('invalid_transition', `A ${h.status} listing cannot be submitted`);
  const [[rooms], [photos]] = await Promise.all([
    db.select({ n: count() }).from(schema.roomTypes).where(eq(schema.roomTypes.hostelId, id)),
    db.select({ n: count() }).from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, id)),
  ]);
  const issues: { path: string; message: string }[] = [];
  if (!rooms!.n) issues.push({ path: 'rooms', message: 'Add at least one room type' });
  if (!photos!.n) issues.push({ path: 'photos', message: 'Add at least one photo' });
  if (issues.length) throw err.validation('Add rooms and photos before submitting', issues);
  const [u] = await db.update(schema.hostels).set({ status: 'pending', rejectionReason: null }).where(eq(schema.hostels.id, id)).returning();
  return u!;
}

export async function applyPartner(user: UserRow, id: string): Promise<HostelRow> {
  const h = await ownedHostel(user, id);
  if (h.status !== 'live') throw err.domain('invalid_transition', 'Only live listings can apply to become a verified partner');
  if (h.partnerStatus === 'verified' || h.partnerStatus === 'applied') throw err.domain('invalid_transition', `Partner status is already ${h.partnerStatus}`);
  const [u] = await db.update(schema.hostels).set({ partnerStatus: 'applied' }).where(eq(schema.hostels.id, id)).returning();
  return u!;
}

// ---------- rooms ----------

async function ownedRoom(user: UserRow, roomId: string) {
  const [r] = await db.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, roomId));
  if (!r) throw err.notFound('Room type');
  await ownedHostel(user, r.hostelId);
  return r;
}

export async function addRoom(user: UserRow, hostelId: string, input: z.output<typeof schemas.roomTypeInput>) {
  await ownedHostel(user, hostelId);
  const [r] = await db
    .insert(schema.roomTypes)
    .values({ id: newId('rmt'), hostelId, ...input })
    .returning();
  return r!;
}

export async function updateRoom(user: UserRow, roomId: string, input: z.output<typeof schemas.roomTypeUpdateInput>) {
  const r = await ownedRoom(user, roomId);
  const next = { ...r, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  if (next.bedsAvailable > next.totalBeds) {
    throw err.validation('Beds free cannot exceed total beds', [{ path: 'bedsAvailable', message: 'Beds free cannot exceed total beds' }]);
  }
  const [u] = await db
    .update(schema.roomTypes)
    .set({ monthlyRent: next.monthlyRent, advanceAmount: next.advanceAmount, totalBeds: next.totalBeds, bedsAvailable: next.bedsAvailable })
    .where(eq(schema.roomTypes.id, roomId))
    .returning();
  return u!;
}

export async function deleteRoom(user: UserRow, roomId: string) {
  await ownedRoom(user, roomId);
  const [subs] = await db
    .select({ n: count() })
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.roomTypeId, roomId), inArray(schema.subscriptions.status, ['pending', 'active', 'cancelled'])));
  const [moves] = await db
    .select({ n: count() })
    .from(schema.moveRequests)
    .where(and(eq(schema.moveRequests.toRoomTypeId, roomId), eq(schema.moveRequests.status, 'scheduled')));
  if (subs!.n || moves!.n) throw err.conflict('conflict', 'This room has subscribers. Set beds free to 0 instead of deleting it.');
  const [history] = await db.select({ n: count() }).from(schema.subscriptions).where(eq(schema.subscriptions.roomTypeId, roomId));
  if (history!.n) {
    // Past subscriptions and invoices reference it: keep the row, just close it.
    await db.update(schema.roomTypes).set({ bedsAvailable: 0, totalBeds: 0 }).where(eq(schema.roomTypes.id, roomId));
    return;
  }
  await db.delete(schema.roomTypes).where(eq(schema.roomTypes.id, roomId));
}

// ---------- photos ----------

export async function addPhoto(user: UserRow, hostelId: string, input: z.output<typeof schemas.addPhotoInput>) {
  await ownedHostel(user, hostelId);
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const existing = await db.select({ s: schema.hostelPhotos.sortOrder }).from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, hostelId));
    sortOrder = existing.length ? Math.max(...existing.map((e) => e.s)) + 1 : 0;
  }
  const [p] = await db.insert(schema.hostelPhotos).values({ id: newId('pho'), hostelId, url: input.url, sortOrder }).returning();
  return p!;
}

export async function deletePhoto(user: UserRow, photoId: string) {
  const [p] = await db.select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.id, photoId));
  if (!p) throw err.notFound('Photo');
  await ownedHostel(user, p.hostelId);
  await db.delete(schema.hostelPhotos).where(eq(schema.hostelPhotos.id, photoId));
}

export async function reorderPhotos(user: UserRow, hostelId: string, photoIds: string[]) {
  await ownedHostel(user, hostelId);
  const photos = await db.select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, hostelId));
  const known = new Set(photos.map((p) => p.id));
  if (photoIds.length !== photos.length || photoIds.some((id) => !known.has(id)) || new Set(photoIds).size !== photoIds.length) {
    throw err.validation('photoIds must list every photo of this hostel exactly once', [{ path: 'photoIds', message: 'Must list every photo once' }]);
  }
  await db.transaction(async (tx) => {
    for (const [i, id] of photoIds.entries()) await tx.update(schema.hostelPhotos).set({ sortOrder: i }).where(eq(schema.hostelPhotos.id, id));
  });
  return db.select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, hostelId)).orderBy(asc(schema.hostelPhotos.sortOrder));
}
