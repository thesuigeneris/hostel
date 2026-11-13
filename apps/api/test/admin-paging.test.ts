import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

/** Admin tables page through every row (the admin audit's "capped at 500 with no paging" gap). */

let adminToken: string;

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  adminToken = await admin();
});

afterEach(() => setClock(null));

describe('admin tables page through every row', () => {
  test('subscriptions and moves: newest first, pages never repeat or skip a row, limits are enforced', async () => {
    const owner = await newOwner();
    const h = await liveHostel(owner, adminToken, { partner: true, rooms: [{ sharing: '2-sharing', monthlyRent: 9000, totalBeds: 20, bedsAvailable: 20 }] });
    const other = await liveHostel(owner, adminToken, { partner: true, area: 'Madhapur', rooms: [{ sharing: 'private', monthlyRent: 12000, totalBeds: 20, bedsAvailable: 20 }] });
    const ids: string[] = [];
    // Created in the same instant, so only the tie-break keeps the order stable.
    for (let i = 0; i < 7; i++) {
      const t = await newTenant(`Tenant ${i}`);
      ids.push((await activeSubscriber(t.token, h.hostel.id, h.rooms[0]!.id)).subscription.id);
      expect((await call('/me/moves', { token: t.token, body: { toRoomTypeId: other.rooms[0]!.id, moveDate: '2026-11-20' } })).status).toBe(201);
    }
    const page = async (path: string, limit: number, offset: number) => (await call(`${path}?limit=${limit}&offset=${offset}`, { token: adminToken })).body;
    for (const path of ['/admin/subscriptions', '/admin/moves']) {
      const pages = [await page(path, 3, 0), await page(path, 3, 3), await page(path, 3, 6), await page(path, 3, 9)];
      expect(pages.map((p) => p.length)).toEqual([3, 3, 1, 0]);
      const seen = pages.flat().map((r: { id?: string; subscription?: { id: string } }) => r.subscription?.id ?? r.id);
      expect(new Set(seen).size).toBe(7);
      expect(pages.flat()).toEqual(await page(path, 200, 0));
    }
    expect((await call('/admin/subscriptions', { token: adminToken })).body).toHaveLength(7);
    expect(new Set(((await page('/admin/subscriptions', 200, 0)) as { subscription: { id: string } }[]).map((r) => r.subscription.id))).toEqual(new Set(ids));
    expect((await call('/admin/subscriptions?limit=201', { token: adminToken })).status).toBe(400);
    expect((await call('/admin/moves?offset=-1', { token: adminToken })).status).toBe(400);
  });
});
