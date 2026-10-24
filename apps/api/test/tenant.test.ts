import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { addDays, istDate, newId, skipCutoff, weekStart } from '@hostels/shared';
import { db, schema } from '../src/db';
import { creditWindow, createInvoiceForPeriod } from '../src/services/billing';
import { skipMeal, unskipMeal } from '../src/services/skips';
import { createHostel, login, req, truncateAll } from './helpers';

beforeEach(truncateAll);

async function setup(room: Partial<typeof schema.roomTypes.$inferInsert> = {}) {
  const o = await login('owner');
  const { hostel, roomType } = await createHostel(o.user.id, {}, room);
  const t = await login('tenant');
  return { owner: o, hostel, roomType, tenant: t };
}

async function subscribeAndPay(token: string, hostelId: string, roomTypeId: string, extra: Record<string, unknown> = {}) {
  const s = await req('POST', '/subscriptions', { token, body: { hostelId, roomTypeId, mealPlan: 'full', diet: 'veg', ...extra } });
  if (s.status !== 201) throw new Error(JSON.stringify(s.body));
  const p = await req('POST', `/payments/${s.body.invoice.id}/simulate`, { token });
  if (p.status !== 200) throw new Error(JSON.stringify(p.body));
  return s.body as { subscription: { id: string; startDate: string }; invoice: { id: string } };
}

async function beds(roomTypeId: string) {
  const [r] = await db.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, roomTypeId));
  return r!.bedsAvailable;
}

describe('subscribe', () => {
  test('requires auth', async () => {
    expect((await req('POST', '/subscriptions', { body: {} })).status).toBe(401);
    expect((await req('GET', '/me/stay')).status).toBe(401);
  });

  test('creates pending sub + period-0 invoice with order, reserves a bed', async () => {
    const { hostel, roomType, tenant } = await setup();
    const r = await req('POST', '/subscriptions', {
      token: tenant.token,
      body: { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'two-meals', diet: 'non-veg' },
    });
    expect(r.status).toBe(201);
    expect(r.body.subscription).toMatchObject({ status: 'pending', startDate: istDate(), mealPlan: 'two-meals' });
    expect(r.body.invoice).toMatchObject({ rentAmount: 9000, foodAmount: 4500, creditAmount: 0, totalAmount: 13500, status: 'due', dueDate: istDate() });
    expect(r.body.invoice.razorpayOrderId).toMatch(/^order_stub_/);
    expect(await beds(roomType.id)).toBe(4);
    const stay = await req('GET', '/me/stay', { token: tenant.token });
    expect(stay.body.subscription.status).toBe('pending');
    expect(stay.body.currentInvoice.id).toBe(r.body.invoice.id);
    expect(stay.body.hostel.id).toBe(hostel.id);
  });

  test('rejects non-partners, second plan, bad dates, foreign room', async () => {
    const { owner, hostel, roomType, tenant } = await setup();
    const { hostel: free, roomType: freeRoom } = await createHostel(owner.user.id, { partnerStatus: 'none' });
    const sub = (body: Record<string, unknown>) =>
      req('POST', '/subscriptions', { token: tenant.token, body: { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'full', diet: 'veg', ...body } });
    expect((await sub({ hostelId: free.id, roomTypeId: freeRoom.id })).body.error).toBe('not_verified');
    expect((await sub({ roomTypeId: freeRoom.id })).status).toBe(404);
    expect((await sub({ startDate: addDays(istDate(), -1) })).body.error).toBe('validation');
    expect((await sub({ startDate: addDays(istDate(), 31) })).body.error).toBe('validation');
    expect((await sub({})).status).toBe(201);
    const again = await sub({});
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('already_subscribed');
  });

  test('no overbooking under concurrent subscribes', async () => {
    const { hostel, roomType } = await setup({ totalBeds: 3, bedsAvailable: 2 });
    const tenants = await Promise.all(Array.from({ length: 6 }, () => login('tenant')));
    const results = await Promise.all(
      tenants.map((t) =>
        req('POST', '/subscriptions', { token: t.token, body: { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'full', diet: 'veg' } }),
      ),
    );
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(2);
    expect(results.filter((r) => r.body?.error === 'no_beds_available')).toHaveLength(4);
    expect(await beds(roomType.id)).toBe(0);
  });

  test('same user racing two subscribes gets one plan', async () => {
    const { hostel, roomType, tenant } = await setup();
    const body = { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'full', diet: 'veg' };
    const rs = await Promise.all([1, 2, 3].map(() => req('POST', '/subscriptions', { token: tenant.token, body })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await beds(roomType.id)).toBe(4);
  });
});

describe('invoices', () => {
  test('lists own invoices with overdue flag', async () => {
    const { hostel, roomType, tenant } = await setup();
    const s = await req('POST', '/subscriptions', { token: tenant.token, body: { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'none', diet: 'veg' } });
    await db.update(schema.invoices).set({ dueDate: addDays(istDate(), -8) }).where(eq(schema.invoices.id, s.body.invoice.id));
    const r = await req('GET', '/me/invoices', { token: tenant.token });
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ totalAmount: 9000, overdue: true });
  });

  test('credit window and cap at food price', async () => {
    expect(creditWindow('2026-10-10', 0)).toBeNull();
    expect(creditWindow('2026-10-10', 1)).toEqual({ from: '2026-10-10', to: '2026-11-04' });
    expect(creditWindow('2026-10-10', 2)).toEqual({ from: '2026-11-05', to: '2026-12-04' });

    const { hostel, roomType, tenant } = await setup();
    const { subscription } = await subscribeAndPay(tenant.token, hostel.id, roomType.id, { mealPlan: 'two-meals' });
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, subscription.id));
    const window = creditWindow(sub!.startDate, 1)!;
    const skip = (date: string, meal: 'breakfast' | 'dinner') => ({
      id: newId('skp'),
      subscriptionId: sub!.id,
      date,
      meal,
      creditAmount: meal === 'breakfast' ? 50 : 80,
    });
    // Two skips inside the window, one on the generation day (belongs to the next bill).
    await db.insert(schema.mealSkips).values([skip(window.from, 'breakfast'), skip(window.to, 'dinner'), skip(addDays(window.to, 1), 'dinner')]);
    const inv = await createInvoiceForPeriod(sub!, 1);
    expect(inv).toMatchObject({ rentAmount: 9000, foodAmount: 4500, creditAmount: 130, totalAmount: 13370 });

    // Inflate credits past the food price: capped.
    await db.update(schema.mealSkips).set({ creditAmount: 5000 }).where(eq(schema.mealSkips.subscriptionId, sub!.id));
    await db.update(schema.invoices).set({ status: 'void' }).where(eq(schema.invoices.id, inv!.id));
    const capped = await createInvoiceForPeriod(sub!, 1);
    expect(capped).toMatchObject({ creditAmount: 4500, totalAmount: 9000 });
    // Generating again for the same period is a no-op.
    expect(await createInvoiceForPeriod(sub!, 1)).toBeNull();
  });
});

describe('skips and menu', () => {
  test('skip, idempotent re-skip, unskip; plan and cut-off checks', async () => {
    const { hostel, roomType, tenant } = await setup();
    await subscribeAndPay(tenant.token, hostel.id, roomType.id, { mealPlan: 'two-meals' });
    const tomorrow = addDays(istDate(), 1);
    const s = await req('POST', '/me/skips', { token: tenant.token, body: { date: tomorrow, meal: 'dinner' } });
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ date: tomorrow, meal: 'dinner', creditAmount: 80 });
    const again = await req('POST', '/me/skips', { token: tenant.token, body: { date: tomorrow, meal: 'dinner' } });
    expect(again.body.id).toBe(s.body.id);
    const lunch = await req('POST', '/me/skips', { token: tenant.token, body: { date: tomorrow, meal: 'lunch' } });
    expect(lunch.body.error).toBe('meal_not_in_plan');
    const yesterday = await req('POST', '/me/skips', { token: tenant.token, body: { date: addDays(istDate(), -1), meal: 'dinner' } });
    expect(yesterday.body.error).toBe('cutoff_passed');
    expect((await req('DELETE', `/me/skips/${tomorrow}/dinner`, { token: tenant.token })).status).toBe(200);
    expect((await req('DELETE', `/me/skips/${tomorrow}/dinner`, { token: tenant.token })).status).toBe(404);
  });

  test('cut-off boundaries enforced at the IST instant', async () => {
    const { hostel, roomType, tenant } = await setup();
    await subscribeAndPay(tenant.token, hostel.id, roomType.id);
    const date = addDays(istDate(), 2);
    const cutoff = skipCutoff(date, 'breakfast');
    await expect(skipMeal(tenant.user.id, date, 'breakfast', new Date(cutoff.getTime() - 1000))).resolves.toMatchObject({ meal: 'breakfast' });
    await expect(unskipMeal(tenant.user.id, date, 'breakfast', cutoff)).rejects.toMatchObject({ code: 'cutoff_passed' });
    await expect(skipMeal(tenant.user.id, date, 'lunch', skipCutoff(date, 'lunch'))).rejects.toMatchObject({ code: 'cutoff_passed' });
  });

  test('pending subscription cannot skip', async () => {
    const { hostel, roomType, tenant } = await setup();
    await req('POST', '/subscriptions', { token: tenant.token, body: { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'full', diet: 'veg' } });
    const r = await req('POST', '/me/skips', { token: tenant.token, body: { date: addDays(istDate(), 1), meal: 'dinner' } });
    expect(r.status).toBe(404);
  });

  test('menu shows 7 days with plan, items, skips and toggles', async () => {
    const { hostel, roomType, tenant } = await setup();
    await subscribeAndPay(tenant.token, hostel.id, roomType.id, { mealPlan: 'two-meals' });
    const today = istDate();
    const mnw = newId('mnw');
    await db.insert(schema.menuWeeks).values({ id: mnw, hostelId: hostel.id, weekStart: weekStart(today), theme: 'Hyderabadi' });
    await db.insert(schema.menuItems).values({ id: newId('mni'), menuWeekId: mnw, date: today, meal: 'dinner', vegDish: 'Veg biryani' });
    await req('POST', '/me/skips', { token: tenant.token, body: { date: addDays(today, 1), meal: 'breakfast' } });
    const r = await req('GET', '/me/menu', { token: tenant.token });
    expect(r.body.days).toHaveLength(7);
    expect(r.body.days[0].date).toBe(today);
    const d0 = r.body.days[0].meals;
    expect(d0.map((m: { meal: string }) => m.meal)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(d0[1]).toMatchObject({ inPlan: false, canToggle: false });
    expect(d0[0].canToggle).toBe(false); // breakfast cut-off was last night
    if (new Date() < skipCutoff(today, 'dinner')) expect(d0[2]).toMatchObject({ inPlan: true, canToggle: true, item: { vegDish: 'Veg biryani' } });
    expect(r.body.days[1].meals[0]).toMatchObject({ skipped: true });
    const none = await login();
    expect((await req('GET', '/me/menu', { token: none.token })).body).toEqual({ days: [] });
  });
});

describe('moves', () => {
  async function twoHostels() {
    const base = await setup();
    const { hostel: dest, roomType: destRoom } = await createHostel(base.owner.user.id, { name: 'Dest' }, { monthlyRent: 12000, bedsAvailable: 1 });
    return { ...base, dest, destRoom };
  }

  test('schedule reserves a destination bed; cancel releases it', async () => {
    const { hostel, roomType, tenant, dest, destRoom } = await twoHostels();
    await subscribeAndPay(tenant.token, hostel.id, roomType.id);
    const moveDate = addDays(istDate(), 3);
    const m = await req('POST', '/me/moves', { token: tenant.token, body: { toHostelId: dest.id, toRoomTypeId: destRoom.id, moveDate } });
    expect(m.status).toBe(201);
    expect(m.body).toMatchObject({ status: 'scheduled', fromHostelId: hostel.id, toHostelId: dest.id, moveDate });
    expect(await beds(destRoom.id)).toBe(0);
    const second = await req('POST', '/me/moves', { token: tenant.token, body: { toHostelId: dest.id, toRoomTypeId: destRoom.id, moveDate } });
    expect(second.body.error).toBe('move_not_allowed');
    const stay = await req('GET', '/me/stay', { token: tenant.token });
    expect(stay.body.upcomingMove.id).toBe(m.body.id);
    const c = await req('DELETE', `/me/moves/${m.body.id}`, { token: tenant.token });
    expect(c.body.status).toBe('cancelled');
    expect(await beds(destRoom.id)).toBe(1);
  });

  test('validation: tomorrow onwards, verified destination, beds, active plan', async () => {
    const { owner, hostel, roomType, tenant, dest, destRoom } = await twoHostels();
    const move = (b: Record<string, unknown>) =>
      req('POST', '/me/moves', { token: tenant.token, body: { toHostelId: dest.id, toRoomTypeId: destRoom.id, moveDate: addDays(istDate(), 2), ...b } });
    expect((await move({})).body.error).toBe('move_not_allowed'); // no plan yet
    await subscribeAndPay(tenant.token, hostel.id, roomType.id);
    expect((await move({ moveDate: istDate() })).body.error).toBe('move_not_allowed');
    const { hostel: free, roomType: freeRoom } = await createHostel(owner.user.id, { partnerStatus: 'none' });
    expect((await move({ toHostelId: free.id, toRoomTypeId: freeRoom.id })).body.error).toBe('not_verified');
    await db.update(schema.roomTypes).set({ bedsAvailable: 0 }).where(eq(schema.roomTypes.id, destRoom.id));
    expect((await move({})).body.error).toBe('no_beds_available');
  });

  test('scheduling a move voids and regenerates an unpaid upcoming bill with the new rent', async () => {
    const { hostel, roomType, tenant, dest, destRoom } = await twoHostels();
    const { subscription } = await subscribeAndPay(tenant.token, hostel.id, roomType.id);
    // Backdate so period 1 starts in a few days and its bill has been generated.
    const [sub] = await db
      .update(schema.subscriptions)
      .set({ startDate: addDays(istDate(), -27) })
      .where(eq(schema.subscriptions.id, subscription.id))
      .returning();
    const period1 = await createInvoiceForPeriod(sub!, 1);
    expect(period1!.rentAmount).toBe(9000);
    const m = await req('POST', '/me/moves', { token: tenant.token, body: { toHostelId: dest.id, toRoomTypeId: destRoom.id, moveDate: period1!.periodStart } });
    expect(m.status).toBe(201);
    const invs = await db.select().from(schema.invoices).where(and(eq(schema.invoices.subscriptionId, sub!.id), eq(schema.invoices.periodStart, period1!.periodStart)));
    expect(invs.map((i) => i.status).sort()).toEqual(['due', 'void']);
    const fresh = invs.find((i) => i.status === 'due')!;
    expect(fresh).toMatchObject({ rentAmount: 12000, hostelId: dest.id, roomTypeId: destRoom.id });
  });
});

describe('cancel', () => {
  test('active plan cancels at end of current paid period and voids later bills', async () => {
    const { hostel, roomType, tenant } = await setup();
    const { subscription } = await subscribeAndPay(tenant.token, hostel.id, roomType.id);
    const r = await req('POST', '/me/subscription/cancel', { token: tenant.token });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('cancelled');
    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.subscriptionId, subscription.id));
    expect(r.body.cancelAt).toBe(inv!.periodEnd);
    expect((await req('POST', '/me/subscription/cancel', { token: tenant.token })).status).toBe(409);
    // Still can't start another plan while cancelling.
    const again = await req('POST', '/subscriptions', { token: tenant.token, body: { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'full', diet: 'veg' } });
    expect(again.body.error).toBe('already_subscribed');
  });

  test('pending plan is dropped immediately and the bed released', async () => {
    const { hostel, roomType, tenant } = await setup();
    await req('POST', '/subscriptions', { token: tenant.token, body: { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'full', diet: 'veg' } });
    expect(await beds(roomType.id)).toBe(4);
    const r = await req('POST', '/me/subscription/cancel', { token: tenant.token });
    expect(r.body.status).toBe('ended');
    expect(await beds(roomType.id)).toBe(5);
    expect((await req('GET', '/me/stay', { token: tenant.token })).body.subscription).toBeNull();
    expect((await req('POST', '/me/subscription/cancel', { token: tenant.token })).status).toBe(404);
  });
});
