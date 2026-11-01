import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { hmacHex } from '../src/lib/crypto';
import * as razorpay from '../src/lib/razorpay';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, checkoutOrderId, newOwner, newTenant, liveHostel, roomBeds } from './fixtures';
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
  test('an owner can take a plan at someone else\'s hostel, never at their own', async () => {
    const own = await subscribe(ownerToken);
    expect(own.status).toBe(409);
    expect(own.body.error).toBe('cannot_subscribe_own_hostel');
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);

    const otherOwner = await newOwner();
    const elsewhere = await subscribe(otherOwner);
    expect(elsewhere.status).toBe(201);
    expect(elsewhere.body.subscription.status).toBe('pending');
    expect((await call('/me', { token: otherOwner })).body.role).toBe('owner');
    const paid = await call(`/payments/${elsewhere.body.invoice.id}/simulate`, { token: otherOwner, method: 'POST' });
    expect(paid.body.status).toBe('paid');
    expect((await call('/me/subscription', { token: otherOwner })).body.subscription.status).toBe('active');
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(4);
  });

  test('admins may take a plan like anyone, except at a hostel they own', async () => {
    // The admin's own hostel: admin rights don't make it any less theirs.
    const adminHostel = await liveHostel(adminToken, adminToken, { partner: true });
    const own = await subscribe(adminToken, adminHostel.hostel.id, adminHostel.rooms[0].id);
    expect(own.body.error).toBe('cannot_subscribe_own_hostel');

    const elsewhere = await subscribe(adminToken);
    expect(elsewhere.status).toBe(201);
    expect((await call('/me/subscription', { token: adminToken })).body.subscription.hostelId).toBe(hostel.id);
  });

  test('an owner with a plan elsewhere cannot move it into their own hostel', async () => {
    const otherOwner = await newOwner();
    await activeSubscriber(otherOwner, hostel.id, room.id);
    const mine = await liveHostel(otherOwner, adminToken, { partner: true, area: 'Madhapur' });
    setClock('2026-11-12T06:00:00Z');
    const move = await call('/me/moves', { token: otherOwner, body: { toRoomTypeId: mine.rooms[0].id, moveDate: '2026-11-20' } });
    expect(move.status).toBe(409);
    expect(move.body.error).toBe('cannot_subscribe_own_hostel');
  });

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
    const [orderA, orderB] = await Promise.all([checkoutOrderId(a.token, subA.body.invoice.id), checkoutOrderId(b.token, subB.body.invoice.id)]);
    expect(orderA).not.toBe(orderB);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(3);

    // Paying B's bill activates B's plan only.
    expect((await paidWebhook(orderB, 'pay_b')).status).toBe(200);
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
    expect(order.body).toMatchObject({ amount: total * 100, currency: 'INR' });
    // Opening checkout again reuses the bill's order.
    expect(await checkoutOrderId(token, res.body.invoice.id)).toBe(order.body.orderId);
  });
});

describe('cancel', () => {
  test('needs a signed-in user with a plan', async () => {
    expect((await call('/me/subscription/cancel', { method: 'POST' })).status).toBe(401);
    // Any role may hold a plan, so an owner without one gets 404, not 403.
    expect((await cancel(ownerToken)).status).toBe(404);
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
    const orderId = await checkoutOrderId(token, sub.body.invoice.id);
    await cancel(token);

    const hook = await paidWebhook(orderId, 'pay_late');

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

describe('the payment order is made outside the booking transaction', () => {
  test('while the payment service is slow, the room stays open to other bookings and owner edits', async () => {
    let orderDone = false;
    const slow = spyOn(razorpay, 'createOrder').mockImplementation(async (opts) => {
      await new Promise((r) => setTimeout(r, 1500));
      orderDone = true;
      return { id: `order_slow_${opts.receipt}`, amount: opts.amountInPaise, currency: 'INR', status: 'created' };
    });
    try {
      const a = await newTenant('A');
      const b = await newTenant('B');
      // A books and opens checkout while Razorpay takes its time.
      const checkoutA = subscribe(a.token).then(async (res) => {
        expect(res.status).toBe(201);
        return call(`/payments/${res.body.invoice.id}/order`, { token: a.token, method: 'POST' });
      });
      await new Promise((r) => setTimeout(r, 200));
      expect((await subscribe(b.token)).status).toBe(201);
      expect((await call(`/owner/rooms/${room.id}`, { token: ownerToken, method: 'PATCH', body: { monthlyRent: 10500 } })).status).toBe(200);
      expect(orderDone).toBe(false);
      expect((await checkoutA).body.orderId).toStartWith('order_slow_');
      expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(3);
    } finally {
      slow.mockRestore();
    }
  });

  test('if the payment service fails, the tenant can retry, and an unpaid plan still releases its bed after 30 minutes', async () => {
    const down = spyOn(razorpay, 'createOrder').mockRejectedValue(new Error('razorpay unreachable'));
    const { token } = await newTenant();
    let invoiceId = '';
    try {
      const res = await subscribe(token);
      expect(res.status).toBe(201);
      invoiceId = res.body.invoice.id;
      expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(4);
      const order = await call(`/payments/${invoiceId}/order`, { token, method: 'POST' });
      expect(order.status).toBe(503);
      expect(order.body.message).toContain('try again');
    } finally {
      down.mockRestore();
    }
    // The service is back: checkout works on retry.
    expect(await checkoutOrderId(token, invoiceId)).toStartWith('order_stub_');

    // The tenant never pays; the pending plan expires and gives the bed back.
    setClock('2026-11-10T06:31:00Z');
    expect((await runJobs()).expiredSubscriptions).toBe(1);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
    expect((await call(`/payments/${invoiceId}`, { token })).body.status).toBe('void');
  });
});
