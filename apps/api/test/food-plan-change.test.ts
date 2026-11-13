import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

/**
 * Product gap 1a: change the food plan or diet without cancelling, from the next bill that is not paid yet
 * (spec docs/superpowers/specs/2026-11-13-food-plan-change.md). Plan started 9 Nov: periods start on the 9th, and
 * each bill is made 5 days ahead (4 Dec for the period from 9 Dec).
 */

let ownerToken: string;
let adminToken: string;
let hostel: { id: string };
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
  room = h.rooms[0]!;
});

afterEach(() => setClock(null));

const change = (token: string, mealPlan: string, diet = 'veg') => call('/me/food-plan', { token, body: { mealPlan, diet } });
const mine = async (token: string) => (await call('/me/subscription', { token })).body;
const bills = async (token: string) => (await call('/me/invoices', { token })).body as { periodStart: string; status: string; foodAmount: number; totalAmount: number }[];

describe('changing the food plan from the next bill', () => {
  test('starts with the next period: that bill is made at the new price, and the job switches the plan on its first day', async () => {
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id, 'full');
    setClock('2026-11-20T06:00:00Z');
    const res = await change(t.token, 'two-meals');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mealPlan: 'two-meals', diet: 'veg', effectiveFrom: '2026-12-09', status: 'scheduled' });
    expect((await mine(t.token)).subscription.mealPlan).toBe('full');
    expect((await mine(t.token)).scheduledFoodChange).toMatchObject({ id: res.body.id, effectiveFrom: '2026-12-09' });

    setClock('2026-12-04T06:00:00Z');
    expect((await runJobs()).foodPlanChanges).toBe(0);
    const next = (await bills(t.token)).find((b) => b.periodStart === '2026-12-09');
    expect(next).toMatchObject({ foodAmount: 4500, totalAmount: 14500 });

    setClock('2026-12-09T06:00:00Z');
    expect((await runJobs()).foodPlanChanges).toBe(1);
    expect((await runJobs()).foodPlanChanges).toBe(0);
    const after = await mine(t.token);
    expect(after.subscription.mealPlan).toBe('two-meals');
    expect(after.scheduledFoodChange).toBeNull();
  });

  test('a bill already made but unpaid is made again at the new price; one already paid is left, and the change waits for the next', async () => {
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id, 'full');
    setClock('2026-12-05T06:00:00Z');
    await runJobs(); // the bill for 9 Dec, at Full board
    expect((await bills(t.token)).find((b) => b.status === 'due')).toMatchObject({ periodStart: '2026-12-09', totalAmount: 16000 });
    expect((await change(t.token, 'none')).body.effectiveFrom).toBe('2026-12-09');
    const due = (await bills(t.token)).filter((b) => b.status === 'due');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ periodStart: '2026-12-09', foodAmount: 0, totalAmount: 10000 });

    // Paid early: the change moves to the bill after.
    const u = await newTenant();
    setClock('2026-11-09T06:00:00Z');
    await activeSubscriber(u.token, hostel.id, room.id, 'full');
    setClock('2026-12-05T06:00:00Z');
    await runJobs();
    const dec = (await bills(u.token)).find((b) => b.status === 'due')!;
    expect((await call(`/payments/${(dec as unknown as { id: string }).id}/simulate`, { token: u.token, method: 'POST' })).status).toBe(200);
    expect((await change(u.token, 'two-meals')).body.effectiveFrom).toBe('2027-01-09');
    expect((await bills(u.token)).find((b) => b.periodStart === '2026-12-09')).toMatchObject({ status: 'paid', foodAmount: 6000 });
  });

  test('skips and the kitchen follow the plan in force on each date', async () => {
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id, 'full', 'veg');
    setClock('2026-12-03T06:00:00Z');
    // A lunch skip on a day of the new plan, made before the change.
    expect((await call('/me/skips', { token: t.token, body: { date: '2026-12-09', meal: 'lunch' } })).status).toBe(201);
    expect((await change(t.token, 'two-meals', 'non-veg')).status).toBe(201);

    // Lunch is not in the new plan from 9 Dec: the old skip is gone and a new one is refused; before then it still works.
    const menu = (await call('/me/menu?days=7', { token: t.token })).body;
    const day = (d: string) => menu.days.find((x: { date: string }) => x.date === d);
    expect(day('2026-12-09').meals.find((m: { meal: string }) => m.meal === 'lunch')).toMatchObject({ inPlan: false, skipped: false });
    expect(day('2026-12-08').meals.find((m: { meal: string }) => m.meal === 'lunch')).toMatchObject({ inPlan: true });
    expect((await call('/me/skips', { token: t.token, body: { date: '2026-12-09', meal: 'lunch' } })).body.error).toBe('meal_not_in_plan');
    expect((await call('/me/skips', { token: t.token, body: { date: '2026-12-08', meal: 'lunch' } })).status).toBe(201);

    const count = async (date: string) => (await call(`/owner/hostels/${hostel.id}/headcount?date=${date}`, { token: ownerToken })).body.meals;
    const lunch = (meals: { meal: string }[]) => meals.find((m) => m.meal === 'lunch');
    const dinner = (meals: { meal: string }[]) => meals.find((m) => m.meal === 'dinner');
    expect(dinner(await count('2026-12-08'))).toMatchObject({ total: 1, veg: 1, nonVeg: 0 });
    expect(lunch(await count('2026-12-09'))).toMatchObject({ total: 0 });
    expect(dinner(await count('2026-12-09'))).toMatchObject({ total: 1, veg: 0, nonVeg: 1 });
  });

  test('a change can be cancelled or replaced; asking for the current plan is refused', async () => {
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id, 'full');
    setClock('2026-12-05T06:00:00Z');
    await runJobs();
    expect((await change(t.token, 'full')).body.error).toBe('invalid_state');

    const first = (await change(t.token, 'none')).body;
    const second = await change(t.token, 'two-meals');
    expect(second.status).toBe(201);
    expect((await mine(t.token)).scheduledFoodChange.id).toBe(second.body.id);
    expect((await bills(t.token)).find((b) => b.status === 'due')).toMatchObject({ foodAmount: 4500 });
    expect((await call(`/me/food-plan/${first.id}`, { token: t.token, method: 'DELETE' })).body.error).toBe('invalid_state');

    const cancelled = await call(`/me/food-plan/${second.body.id}`, { token: t.token, method: 'DELETE' });
    expect(cancelled.body.status).toBe('cancelled');
    expect((await mine(t.token)).scheduledFoodChange).toBeNull();
    expect((await bills(t.token)).find((b) => b.status === 'due')).toMatchObject({ foodAmount: 6000, totalAmount: 16000 });

    // Someone else's change is not found.
    const other = await newTenant();
    expect((await call(`/me/food-plan/${second.body.id}`, { token: other.token, method: 'DELETE' })).status).toBe(404);
  });

  test('no food where the hostel serves none, including the hostel of a scheduled move', async () => {
    const noFood = await liveHostel(ownerToken, adminToken, { partner: true, area: 'Madhapur', foodAvailable: false });
    const t = await newTenant();
    await activeSubscriber(t.token, noFood.hostel.id, noFood.rooms[0]!.id, 'none');
    expect((await change(t.token, 'full')).body.error).toBe('invalid_state');
    // Without food the diet changes nothing, so it is not a change.
    expect((await change(t.token, 'none', 'non-veg')).body.error).toBe('invalid_state');

    // A change to food at a food hostel blocks a move to a hostel without food.
    const u = await newTenant();
    await activeSubscriber(u.token, hostel.id, room.id, 'none');
    expect((await change(u.token, 'full')).status).toBe(201);
    const move = await call('/me/moves', { token: u.token, body: { toRoomTypeId: noFood.rooms[0]!.id, moveDate: '2026-11-20' } });
    expect(move.body.error).toBe('move_not_allowed');
  });

  test('a plan that ends before the change starts drops it; the job never applies it', async () => {
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id, 'full');
    setClock('2026-11-20T06:00:00Z');
    expect((await change(t.token, 'two-meals')).status).toBe(201);
    expect((await call('/me/subscription/cancel', { token: t.token, method: 'POST' })).body.cancelAt).toBe('2026-12-08');
    expect((await mine(t.token)).scheduledFoodChange).toBeNull();
    expect((await change(t.token, 'none')).body.error).toBe('invalid_state');
    setClock('2026-12-09T06:00:00Z');
    expect((await runJobs()).foodPlanChanges).toBe(0);
  });

  test('needs a signed-in user with an active plan', async () => {
    expect((await call('/me/food-plan', { body: { mealPlan: 'none', diet: 'veg' } })).status).toBe(401);
    const t = await newTenant();
    expect((await change(t.token, 'none')).body.error).toBe('invalid_state');
    expect((await call('/me/food-plan', { token: t.token, body: { mealPlan: 'lots', diet: 'veg' } })).status).toBe(400);
  });
});
