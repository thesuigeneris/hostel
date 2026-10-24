import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { hmacHex } from '../src/lib/crypto';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, newOwner, newTenant, liveHostel, roomBeds } from './fixtures';
import { call, resetDb } from './helpers';

// Edges of the subscribe and cancel lifecycle that billing.test.ts does not reach.

let ownerToken: string;
let adminToken: string;
let hostel: { id: string; slug: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-10T06:00:00Z'); // 11:30 IST
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

const subscribe = (token: string, hostelId = hostel.id, roomTypeId = room.id, mealPlan = 'full') =>
  call(`/hostels/${hostelId}/subscribe`, { token, body: { roomTypeId, mealPlan } });

const cancel = (token: string) => call('/me/subscription/cancel', { token, method: 'POST' });

function paidWebhook(orderId: string, paymentId: string) {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
  return call('/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': hmacHex('test-webhook-secret', body) } });
}

describe('subscribe', () => {
  test('needs a signed-in tenant and a live hostel', async () => {
    expect((await call(`/hostels/${hostel.id}/subscribe`, { body: { roomTypeId: room.id, mealPlan: 'full' } })).status).toBe(401);
    const { token } = await newTenant();
    expect((await subscribe(token, 'hst_missing')).status).toBe(404);

    const draft = await call('/owner/hostels', {
      token: ownerToken,
      body: { name: 'Draft House', area: 'Kondapur', lat: 17.46, lng: 78.36, genderType: 'coliving', contactPhone: '9876500003' },
    });
    expect((await subscribe(token, draft.body.id)).status).toBe(404);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
  });

  test('tenants who subscribe at the same moment each get their own plan, bill and order', async () => {
    const [a, b] = await Promise.all([newTenant('A'), newTenant('B')]);
    const [subA, subB] = await Promise.all([subscribe(a.token), subscribe(b.token)]);
    expect(subA.status).toBe(201);
    expect(subB.status).toBe(201);
    expect(subA.body.subscription.id).not.toBe(subB.body.subscription.id);
    expect(subA.body.invoice.id).not.toBe(subB.body.invoice.id);
    expect(subA.body.invoice.razorpayOrderId).not.toBe(subB.body.invoice.razorpayOrderId);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(3);

    // Paying B's bill activates B's plan only.
    expect((await paidWebhook(subB.body.invoice.razorpayOrderId, 'pay_b')).status).toBe(200);
    const mineA = await call('/me/subscription', { token: a.token });
    const mineB = await call('/me/subscription', { token: b.token });
    expect(mineA.body.subscription).toMatchObject({ id: subA.body.subscription.id, status: 'pending' });
    expect(mineB.body.subscription).toMatchObject({ id: subB.body.subscription.id, status: 'active' });
  });

  test.each([
    ['full', 16000],
    ['two-meals', 14500],
    ['none', 10000],
  ])('the first bill on the %s plan is ₹%d', async (mealPlan, total) => {
    const { token } = await newTenant();
    const res = await subscribe(token, hostel.id, room.id, mealPlan);
    expect(res.status).toBe(201);
    expect(res.body.invoice).toMatchObject({ rentAmount: 10000, totalAmount: total });
    const order = await call(`/payments/${res.body.invoice.id}/order`, { token, method: 'POST' });
    expect(order.body).toMatchObject({ orderId: res.body.invoice.razorpayOrderId, amount: total * 100, currency: 'INR' });
  });
});

describe('cancel', () => {
  test('needs a signed-in tenant with a plan', async () => {
    expect((await call('/me/subscription/cancel', { method: 'POST' })).status).toBe(401);
    expect((await cancel(ownerToken)).status).toBe(403);
    const { token } = await newTenant();
    expect((await cancel(token)).status).toBe(404);
  });

  test("cancelling one tenant's plan leaves another's alone", async () => {
    const a = await newTenant('A');
    const b = await newTenant('B');
    await activeSubscriber(a.token, hostel.id, room.id);
    await subscribe(b.token);

    expect((await cancel(b.token)).body.status).toBe('cancelled');

    const mineA = await call('/me/subscription', { token: a.token });
    expect(mineA.body.subscription).toMatchObject({ status: 'active', cancelAt: null });
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(4);
  });

  test('the bill of a cancelled pending plan can no longer be paid', async () => {
    const { token } = await newTenant();
    const sub = await subscribe(token);
    await cancel(token);

    const page = await call(`/payments/${sub.body.invoice.id}`, { token });
    expect(page.body.status).toBe('void');
    const pay = await call(`/payments/${sub.body.invoice.id}/simulate`, { token, method: 'POST' });
    expect(pay.status).toBe(409);
    expect(pay.body.error).toBe('invalid_state');
    expect((await call('/me/subscription', { token })).body).toBeNull();
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
  });

  test('a payment webhook that arrives after cancelling is acknowledged but does not revive the plan', async () => {
    const { token } = await newTenant();
    const sub = await subscribe(token);
    await cancel(token);

    const hook = await paidWebhook(sub.body.invoice.razorpayOrderId, 'pay_late');

    expect(hook.status).toBe(200);
    expect((await call('/me/subscription', { token })).body).toBeNull();
    expect((await call('/me/residencies', { token })).body).toHaveLength(0);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
  });

  test('after cancelling a pending plan the tenant can subscribe again', async () => {
    const { token } = await newTenant();
    const first = await subscribe(token);
    await cancel(token);

    const again = await subscribe(token, hostel.id, room.id, 'none');

    expect(again.status).toBe(201);
    expect(again.body.subscription.id).not.toBe(first.body.subscription.id);
    expect(again.body.subscription).toMatchObject({ status: 'pending', mealPlan: 'none' });
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(4);
  });

  test('a cancelled active plan keeps its bed and blocks a new plan until it ends', async () => {
    const { token } = await newTenant();
    await activeSubscriber(token, hostel.id, room.id);
    setClock('2026-11-20T06:00:00Z');
    expect((await cancel(token)).body).toMatchObject({ status: 'active', cancelAt: '2026-12-09' });
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(4);
    expect((await subscribe(token)).body.error).toBe('already_subscribed');

    setClock('2026-12-10T06:00:00Z');
    expect((await runJobs()).endedSubscriptions).toBe(1);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
    expect((await call('/me/subscription', { token })).body).toBeNull();

    const again = await subscribe(token);
    expect(again.status).toBe(201);
    expect(again.body.subscription.startDate).toBe('2026-12-10');
  });
});
