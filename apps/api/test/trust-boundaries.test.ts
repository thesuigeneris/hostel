import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

let ownerToken: string;
let adminToken: string;
let hostel: { id: string; slug: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-06-01T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true });
  hostel = h.hostel;
  room = h.rooms[0];
});

afterEach(() => setClock(null));

const REVIEW = { rating: 2, cleanliness: 2, food: 2, safety: 3, responsiveness: 1, body: 'The rooms were not cleaned for weeks and nobody answered.' };

/** Edge case T6: the public issue record appears only from 3 issues in the last 90 days. */
describe('transparency threshold (T6)', () => {
  test('hidden at 2 issues, shown at 3 and 4, and an issue 91 days old is not counted', async () => {
    const resident = await newTenant('Asha Rao');
    await activeSubscriber(resident.token, hostel.id, room.id);
    const report = (title: string) => call(`/hostels/${hostel.id}/issues`, { token: resident.token, body: { category: 'water', title } });
    const transparency = async () => (await call(`/hostels/${hostel.slug}`)).body.transparency;

    // One issue is 91 days old when the others are filed.
    expect((await report('Old leak in the corridor')).status).toBe(201);
    setClock('2026-09-01T06:00:00Z'); // 92 days after 2026-06-01: outside the 90-day window
    expect((await report('Tap dripping today')).status).toBe(201);
    expect((await report('Light flickering today')).status).toBe(201);
    // Three issues exist, but only two are inside the window, so the panel stays hidden.
    expect(await transparency()).toBeNull();

    expect((await report('Fan noisy today')).status).toBe(201);
    expect(await transparency()).toMatchObject({ windowDays: 90, reported: 3 });
    expect((await report('Door lock stuck today')).status).toBe(201);
    expect(await transparency()).toMatchObject({ reported: 4 });

    // The edge: an issue exactly 90 days old still counts; one day later all four have left the window.
    setClock('2026-11-30T06:00:00Z');
    expect(await transparency()).toMatchObject({ reported: 4 });
    setClock('2026-12-01T06:00:00Z');
    expect(await transparency()).toBeNull();
  });
});

/** Edge case T5: flags only queue a review for an admin; nothing is hidden by the flagging itself. */
describe('flags do not hide reviews (T5)', () => {
  test('an owner flagging every negative review changes nothing public until an admin acts', async () => {
    const people = await Promise.all(['Asha Rao', 'Ravi Kumar', 'Meena Iyer'].map((n) => newTenant(n)));
    for (const p of people) await activeSubscriber(p.token, hostel.id, room.id);
    setClock('2026-06-20T06:00:00Z'); // past the 14-day wait
    const reviews = [];
    for (const p of people) {
      const r = await call(`/hostels/${hostel.id}/review`, { token: p.token, method: 'PUT', body: REVIEW });
      expect(r.status).toBe(200);
      reviews.push(r.body);
    }
    const before = (await call(`/hostels/${hostel.slug}`)).body.ratings;
    expect(before).toMatchObject({ reviewCount: 3, rating: 2 });

    for (const r of reviews) {
      const flag = await call(`/reviews/${r.id}/flag`, { token: ownerToken, body: { reason: 'Not a real resident' } });
      expect(flag.status).toBe(200);
    }

    // Still public, still counted.
    const after = (await call(`/hostels/${hostel.slug}`)).body.ratings;
    expect(after).toMatchObject({ reviewCount: 3, rating: 2 });
    expect((await call(`/hostels/${hostel.slug}/reviews`)).body).toHaveLength(3);
    // The admin queue holds all three, each flagged once.
    const queue = (await call('/admin/reviews/flagged', { token: adminToken })).body as { flags: number }[];
    expect(queue).toHaveLength(3);
    expect(queue.every((q) => q.flags === 1)).toBe(true);

    // Only the admin's decision removes one, and only that one.
    expect((await call(`/admin/reviews/${reviews[0].id}/hide`, { token: adminToken, body: { reason: 'Personal data' } })).status).toBe(200);
    expect((await call(`/hostels/${hostel.slug}/reviews`)).body).toHaveLength(2);
    expect((await call(`/hostels/${hostel.slug}`)).body.ratings.reviewCount).toBe(2);
  });
});
