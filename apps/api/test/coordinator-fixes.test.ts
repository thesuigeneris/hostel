import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, addListingPhoto, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

let ownerToken: string;
let adminToken: string;
let hostel: { id: string; slug: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-20T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true });
  hostel = h.hostel;
  room = h.rooms[0];
});

afterEach(() => setClock(null));

const openStays = (phone: string) =>
  getDb()
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.hostelId, hostel.id), eq(schema.residencies.phone, phone)));

describe('an owner-added resident who then subscribes is counted once', () => {
  test('an accepted owner-added stay ends the day before the plan starts', async () => {
    const tenant = await newTenant('Asha Rao');
    const added = await call(`/owner/hostels/${hostel.id}/residents`, {
      token: ownerToken,
      body: { phone: tenant.phone, name: 'Asha Rao', monthlyRent: 9000, startDate: '2026-11-01' },
    });
    expect(added.status).toBe(201);
    expect((await call(`/me/residencies/${added.body.id}/accept`, { token: tenant.token, method: 'POST' })).status).toBe(200);

    await activeSubscriber(tenant.token, hostel.id, room.id);

    const stays = await openStays(tenant.phone);
    const owner = stays.find((s) => s.source === 'owner')!;
    const platform = stays.find((s) => s.source === 'subscription')!;
    expect(owner).toMatchObject({ status: 'ended', endDate: '2026-11-19' });
    expect(platform).toMatchObject({ status: 'active', startDate: '2026-11-20' });
    expect(stays.filter((s) => s.status === 'active')).toHaveLength(1);
    // The owner's roster shows the person once, as the platform resident.
    const roster = await call(`/owner/hostels/${hostel.id}/residents`, { token: ownerToken });
    const current = (roster.body.current ?? roster.body) as { phone: string; status: string }[];
    expect(current.filter((r) => r.phone === tenant.phone && r.status === 'active')).toHaveLength(1);
  });

  test('an invite never answered is withdrawn; a stay added today ends on its own start day', async () => {
    const invited = await newTenant('Ravi');
    const inv = await call(`/owner/hostels/${hostel.id}/residents`, {
      token: ownerToken,
      body: { phone: invited.phone, name: 'Ravi', monthlyRent: 9000, startDate: '2026-11-10' },
    });
    expect(inv.status).toBe(201);
    await activeSubscriber(invited.token, hostel.id, room.id);
    expect((await openStays(invited.phone)).find((s) => s.source === 'owner')!.status).toBe('declined');

    const sameDay = await newTenant('Meena');
    const sd = await call(`/owner/hostels/${hostel.id}/residents`, {
      token: ownerToken,
      body: { phone: sameDay.phone, name: 'Meena', monthlyRent: 9000, startDate: '2026-11-20' },
    });
    await call(`/me/residencies/${sd.body.id}/accept`, { token: sameDay.token, method: 'POST' });
    await activeSubscriber(sameDay.token, hostel.id, room.id);
    // Never an end date before the start date.
    expect((await openStays(sameDay.phone)).find((s) => s.source === 'owner')).toMatchObject({ status: 'ended', endDate: '2026-11-20' });
  });
});

test('a paused partner says it is not taking subscriptions, not that it is unverified', async () => {
  await getDb().update(schema.ownerPlans).set({ suspended: true }).where(eq(schema.ownerPlans.hostelId, hostel.id));
  const tenant = await newTenant();
  const res = await call(`/hostels/${hostel.id}/subscribe`, { token: tenant.token, body: { roomTypeId: room.id, mealPlan: 'full', diet: 'veg' } });
  expect(res.body.error).toBe('not_verified');
  expect(res.body.message).toContain('isn’t taking new subscriptions right now');
  expect(res.body.message).not.toContain('bill');
});

test('a photo order must name every photo exactly once', async () => {
  await addListingPhoto(ownerToken, hostel.id);
  await addListingPhoto(ownerToken, hostel.id);
  const photos = (await call(`/owner/hostels/${hostel.id}`, { token: ownerToken })).body.photos as { id: string }[];
  expect(photos).toHaveLength(3);
  const order = (photoIds: string[]) => call(`/owner/hostels/${hostel.id}/photos/order`, { token: ownerToken, method: 'PUT', body: { photoIds } });

  for (const bad of [[photos[2]!.id], [photos[2]!.id, photos[2]!.id, photos[0]!.id], [photos[0]!.id, photos[1]!.id, 'pho_not_here']]) {
    const res = await order(bad);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('reload the page');
  }
  const ok = await order([photos[2]!.id, photos[0]!.id, photos[1]!.id]);
  expect(ok.status).toBe(200);
  const rows = await getDb().select().from(schema.hostelPhotos).where(eq(schema.hostelPhotos.hostelId, hostel.id));
  expect(new Set(rows.map((r) => r.sortOrder)).size).toBe(3);
  expect(rows.find((r) => r.id === photos[2]!.id)!.sortOrder).toBe(0);
});
