import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, roomBeds } from './fixtures';
import { call, resetDb } from './helpers';

let ownerToken: string;
let adminToken: string;
let hostel: { id: string; slug: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z'); // Monday 11:30 IST
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, {
    partner: true,
    rooms: [{ sharing: '2-sharing', monthlyRent: 10000, totalBeds: 10, bedsAvailable: 5 }],
  });
  hostel = h.hostel;
  room = h.rooms[0];
});

afterEach(() => setClock(null));

const week = (theme: string) => ({
  theme,
  items: ['2026-11-09', '2026-11-10', '2026-11-11'].flatMap((date) => [
    { date, meal: 'breakfast', vegDish: 'Idli' },
    { date, meal: 'lunch', vegDish: 'Sambar rice', nonVegDish: 'Chicken curry' },
    { date, meal: 'dinner', vegDish: 'Chapati' },
  ]),
});

describe('menus', () => {
  test('owner saves a week, the public sees it, copy-last-week shifts dates', async () => {
    const saved = await call(`/owner/hostels/${hostel.id}/menus/2026-11-09`, { token: ownerToken, method: 'PUT', body: week('South Indian week') });
    expect(saved.status).toBe(200);
    expect(saved.body.items).toHaveLength(9);
    const pub = await call(`/hostels/${hostel.slug}/menu`);
    expect(pub.body.theme).toBe('South Indian week');
    expect(pub.body.items[1]).toMatchObject({ meal: 'lunch', nonVegDish: 'Chicken curry' });

    const copied = await call(`/owner/hostels/${hostel.id}/menus/2026-11-16/copy-last`, { token: ownerToken, method: 'POST' });
    expect(copied.body.items[0].date).toBe('2026-11-16');
    expect(copied.body.theme).toBe('South Indian week');

    const notMonday = await call(`/owner/hostels/${hostel.id}/menus/2026-11-10`, { token: ownerToken, method: 'PUT', body: week('x') });
    expect(notMonday.status).toBe(400);
    const outside = await call(`/owner/hostels/${hostel.id}/menus/2026-11-16`, { token: ownerToken, method: 'PUT', body: week('x') });
    expect(outside.status).toBe(400);
  });

  test('menus need the Partner plan', async () => {
    const free = await liveHostel(ownerToken, adminToken);
    const res = await call(`/owner/hostels/${free.hostel.id}/menus/2026-11-09`, { token: ownerToken, method: 'PUT', body: week('x') });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('plan_required');
  });
});

describe('meal skips and headcount', () => {
  test('cut-offs, plan meals, undo, and the headcount after skips', async () => {
    await call(`/owner/hostels/${hostel.id}/menus/2026-11-09`, { token: ownerToken, method: 'PUT', body: week('Theme') });
    const veg = await newTenant('Veg');
    const nonVeg = await newTenant('NonVeg');
    const twoMeals = await newTenant('Two');
    await activeSubscriber(veg.token, hostel.id, room.id, 'full', 'veg');
    await activeSubscriber(nonVeg.token, hostel.id, room.id, 'full', 'non-veg');
    await activeSubscriber(twoMeals.token, hostel.id, room.id, 'two-meals', 'veg');

    // 11:30 IST on the 9th: lunch (09:00) has closed, dinner (15:00) is open, tomorrow's breakfast is open until 22:00.
    expect((await call('/me/skips', { token: veg.token, body: { date: '2026-11-09', meal: 'lunch' } })).body.error).toBe('cutoff_passed');
    expect((await call('/me/skips', { token: veg.token, body: { date: '2026-11-09', meal: 'dinner' } })).status).toBe(201);
    expect((await call('/me/skips', { token: twoMeals.token, body: { date: '2026-11-10', meal: 'lunch' } })).body.error).toBe('meal_not_in_plan');
    expect((await call('/me/skips', { token: nonVeg.token, body: { date: '2026-11-10', meal: 'breakfast' } })).status).toBe(201);
    // Skipping twice is harmless.
    expect((await call('/me/skips', { token: nonVeg.token, body: { date: '2026-11-10', meal: 'breakfast' } })).status).toBe(201);

    const menu = await call('/me/menu?days=2', { token: nonVeg.token });
    expect(menu.body.days[1].meals[0]).toMatchObject({ meal: 'breakfast', skipped: true, canChange: true, vegDish: 'Idli', credit: 50 });
    expect(menu.body.days[0].meals[1]).toMatchObject({ meal: 'lunch', canChange: false });

    const today = await call(`/owner/hostels/${hostel.id}/headcount?date=2026-11-09`, { token: ownerToken });
    expect(today.body.meals).toEqual([
      { meal: 'breakfast', total: 3, veg: 2, nonVeg: 1, skipped: 0 },
      { meal: 'lunch', total: 2, veg: 1, nonVeg: 1, skipped: 0 },
      { meal: 'dinner', total: 2, veg: 1, nonVeg: 1, skipped: 1 },
    ]);
    const tomorrow = await call(`/owner/hostels/${hostel.id}/headcount?date=2026-11-10`, { token: ownerToken });
    expect(tomorrow.body.meals[0]).toEqual({ meal: 'breakfast', total: 2, veg: 2, nonVeg: 0, skipped: 1 });

    // Undo before the cut-off; after it, the skip is locked.
    expect((await call('/me/skips/2026-11-10/breakfast', { token: nonVeg.token, method: 'DELETE' })).status).toBe(200);
    setClock('2026-11-09T16:31:00Z'); // 22:01 IST
    expect((await call('/me/skips', { token: nonVeg.token, body: { date: '2026-11-10', meal: 'breakfast' } })).body.error).toBe('cutoff_passed');
    expect((await call('/me/skips/2026-11-09/dinner', { token: veg.token, method: 'DELETE' })).body.error).toBe('cutoff_passed');

    const subs = await call(`/owner/hostels/${hostel.id}/subscribers`, { token: ownerToken });
    expect(subs.body).toHaveLength(3);
  });

  test('pending plans cannot skip', async () => {
    const t = await newTenant();
    await call(`/hostels/${hostel.id}/subscribe`, { token: t.token, body: { roomTypeId: room.id, mealPlan: 'full' } });
    expect((await call('/me/skips', { token: t.token, body: { date: '2026-11-11', meal: 'lunch' } })).body.error).toBe('invalid_state');
  });
});

describe('moves', () => {
  test('a room a tenant is moving into cannot be deleted', async () => {
    const dest = await liveHostel(ownerToken, adminToken, { partner: true, area: 'Madhapur' });
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id, 'full');
    setClock('2026-12-05T06:00:00Z');
    expect((await call('/me/moves', { token: t.token, body: { toRoomTypeId: dest.rooms[0].id, moveDate: '2026-12-15' } })).status).toBe(201);
    const del = await call(`/owner/rooms/${dest.rooms[0].id}`, { token: ownerToken, method: 'DELETE' });
    expect(del.body.error).toBe('invalid_state');
  });

  test('schedule reserves a bed, re-bills unpaid periods at the new rent, completes on the date', async () => {
    const dest = await liveHostel(ownerToken, adminToken, {
      partner: true,
      area: 'Madhapur',
      rooms: [{ sharing: 'private', monthlyRent: 15000, totalBeds: 3, bedsAvailable: 1 }],
    });
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id, 'full');
    setClock('2026-12-05T06:00:00Z');
    await runJobs(); // December bill at the old room
    expect((await call('/me/invoices', { token: t.token })).body[0].rentAmount).toBe(10000);

    expect((await call('/me/moves', { token: t.token, body: { toRoomTypeId: dest.rooms[0].id, moveDate: '2026-12-05' } })).body.error).toBe('move_not_allowed');
    const move = await call('/me/moves', { token: t.token, body: { toRoomTypeId: dest.rooms[0].id, moveDate: '2026-12-08' } });
    expect(move.status).toBe(201);
    expect(await roomBeds(ownerToken, dest.hostel.id, dest.rooms[0].id)).toBe(0);
    const bills = (await call('/me/invoices', { token: t.token })).body;
    expect(bills[0]).toMatchObject({ periodStart: '2026-12-09', rentAmount: 15000, hostelId: dest.hostel.id });

    const second = await call('/me/moves', { token: t.token, body: { toRoomTypeId: room.id, moveDate: '2026-12-20' } });
    expect(second.body.error).toBe('move_not_allowed');

    setClock('2026-12-08T06:00:00Z');
    expect((await runJobs()).completedMoves).toBe(1);
    expect((await runJobs()).completedMoves).toBe(0);
    const me = await call('/me/subscription', { token: t.token });
    expect(me.body.subscription).toMatchObject({ hostelId: dest.hostel.id, roomTypeId: dest.rooms[0].id });
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
    const stays = (await call('/me/residencies', { token: t.token })).body;
    expect(stays.map((s: { status: string; hostel: { id: string } }) => [s.status, s.hostel.id])).toEqual([
      ['active', dest.hostel.id],
      ['ended', hostel.id],
    ]);
  });

  test('cancelling a scheduled move frees the destination bed and restores the bill', async () => {
    const dest = await liveHostel(ownerToken, adminToken, {
      partner: true,
      rooms: [{ sharing: 'private', monthlyRent: 15000, totalBeds: 3, bedsAvailable: 2 }],
    });
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id, 'full');
    setClock('2026-12-05T06:00:00Z');
    await runJobs();
    const move = await call('/me/moves', { token: t.token, body: { toRoomTypeId: dest.rooms[0].id, moveDate: '2026-12-15' } });
    // A move inside a period changes that period's room only from the next bill.
    expect((await call('/me/invoices', { token: t.token })).body[0].rentAmount).toBe(10000);
    expect(await roomBeds(ownerToken, dest.hostel.id, dest.rooms[0].id)).toBe(1);
    const cancelled = await call(`/me/moves/${move.body.id}`, { token: t.token, method: 'DELETE' });
    expect(cancelled.body.status).toBe('cancelled');
    expect(await roomBeds(ownerToken, dest.hostel.id, dest.rooms[0].id)).toBe(2);
    expect((await call(`/me/moves/${move.body.id}`, { token: t.token, method: 'DELETE' })).body.error).toBe('move_not_allowed');
  });

  test('cannot move to a free listing', async () => {
    const free = await liveHostel(ownerToken, adminToken);
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id, 'full');
    const res = await call('/me/moves', { token: t.token, body: { toRoomTypeId: free.rooms[0].id, moveDate: '2026-11-20' } });
    expect(res.body.error).toBe('not_verified');
  });
});

describe('payouts', () => {
  test('gross of paid bills by paid month, fee %, idempotent, mark paid', async () => {
    const a = await newTenant();
    const b = await newTenant();
    await activeSubscriber(a.token, hostel.id, room.id, 'full'); // 16000
    await activeSubscriber(b.token, hostel.id, room.id, 'none'); // 10000
    expect((await call('/admin/payouts/generate', { token: adminToken, body: { month: '2026-11' } })).body.error).toBe('invalid_state');

    setClock('2026-12-02T06:00:00Z');
    const gen = await call('/admin/payouts/generate', { token: adminToken, body: { month: '2026-11' } });
    expect(gen.body).toHaveLength(1);
    expect(gen.body[0]).toMatchObject({ grossAmount: 26000, platformFee: 2600, netAmount: 23400, status: 'pending', periodMonth: '2026-11' });
    const again = await call('/admin/payouts/generate', { token: adminToken, body: { month: '2026-11' } });
    expect(again.body).toHaveLength(1);
    expect(again.body[0].id).toBe(gen.body[0].id);

    const paid = await call(`/admin/payouts/${gen.body[0].id}/paid`, { token: adminToken, method: 'POST' });
    expect(paid.body.status).toBe('paid');
    const mine = await call('/owner/payouts', { token: ownerToken });
    expect(mine.body.history[0]).toMatchObject({ status: 'paid', netAmount: 23400 });
    expect((await call('/admin/payouts/generate', { token: adminToken, body: { month: '2026-11' } })).body[0].status).toBe('paid');
  });
});
