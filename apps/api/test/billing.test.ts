import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { signPayment } from '../src/lib/razorpay';
import { hmacHex } from '../src/lib/crypto';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, roomBeds } from './fixtures';
import { call, resetDb } from './helpers';

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

describe('subscribe', () => {
  test('creates a pending plan, reserves a bed and bills period 0 with no advance', async () => {
    const { token } = await newTenant();
    const res = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'two-meals', diet: 'non-veg' } });
    expect(res.status).toBe(201);
    expect(res.body.subscription).toMatchObject({ status: 'pending', startDate: '2026-11-10', mealPlan: 'two-meals', diet: 'non-veg' });
    expect(res.body.invoice).toMatchObject({
      periodStart: '2026-11-10',
      periodEnd: '2026-12-09',
      rentAmount: 10000,
      foodAmount: 4500,
      creditAmount: 0,
      totalAmount: 14500,
      status: 'due',
      dueDate: '2026-11-10',
    });
    expect(res.body.invoice.razorpayOrderId).toStartWith('order_stub_');
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(4);

    const again = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } });
    expect(again.body.error).toBe('already_subscribed');
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(4);
  });

  test('free listings, owners and food plans at no-food hostels are refused', async () => {
    const free = await liveHostel(ownerToken, adminToken);
    const { token } = await newTenant();
    const r1 = await call(`/hostels/${free.hostel.id}/subscribe`, { token, body: { roomTypeId: free.rooms[0].id, mealPlan: 'full' } });
    expect(r1.body.error).toBe('not_verified');
    const r2 = await call(`/hostels/${hostel.id}/subscribe`, { token: ownerToken, body: { roomTypeId: room.id, mealPlan: 'full' } });
    expect(r2.status).toBe(403);
    const noFood = await liveHostel(ownerToken, adminToken, { partner: true, foodAvailable: false });
    const r3 = await call(`/hostels/${noFood.hostel.id}/subscribe`, { token, body: { roomTypeId: noFood.rooms[0].id, mealPlan: 'full' } });
    expect(r3.status).toBe(400);
    const r4 = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: noFood.rooms[0].id, mealPlan: 'none' } });
    expect(r4.status).toBe(404);
  });

  test('concurrent subscribes never overbook the last bed', async () => {
    await call(`/owner/rooms/${room.id}`, { token: ownerToken, method: 'PATCH', body: { bedsAvailable: 1 } });
    const tenants = await Promise.all(Array.from({ length: 6 }, (_, i) => newTenant(`T${i}`)));
    const results = await Promise.all(
      tenants.map((t) => call(`/hostels/${hostel.id}/subscribe`, { token: t.token, body: { roomTypeId: room.id, mealPlan: 'full' } })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.body?.error === 'no_beds_available')).toHaveLength(5);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(0);
  });

  test('one tenant double-submitting gets one plan and one bed', async () => {
    const { token } = await newTenant();
    const results = await Promise.all(
      [1, 2, 3].map(() => call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.body?.error === 'already_subscribed')).toHaveLength(2);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(4);
  });
});

describe('payments', () => {
  test('paying activates the plan and starts a residency; paying again is refused', async () => {
    const { token } = await newTenant();
    const sub = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } });
    const page = await call(`/payments/${sub.body.invoice.id}`, { token });
    expect(page.body).toMatchObject({ kind: 'tenant', amount: 16000, status: 'due', stub: true });
    expect(page.body.description).toContain('2026-11-10');

    const paid = await call(`/payments/${sub.body.invoice.id}/simulate`, { token, method: 'POST' });
    expect(paid.body.status).toBe('paid');
    const me = await call('/me/subscription', { token });
    expect(me.body.subscription.status).toBe('active');
    expect(me.body.invoices[0].paidAt).toBeTruthy();
    const res = await call('/me/residencies', { token });
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ source: 'subscription', status: 'active', canReview: false });

    const twice = await call(`/payments/${sub.body.invoice.id}/simulate`, { token, method: 'POST' });
    expect(twice.body.error).toBe('invoice_already_paid');
  });

  test('a bad signature is a 400, never a 500', async () => {
    const { token } = await newTenant();
    const sub = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } });
    const orderId = sub.body.invoice.razorpayOrderId;
    for (const sig of ['short', 'x'.repeat(64), signPayment(orderId, 'pay_other')]) {
      const res = await call(`/payments/${sub.body.invoice.id}/verify`, {
        token,
        body: { razorpayOrderId: orderId, razorpayPaymentId: 'pay_1', razorpaySignature: sig },
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('signature_invalid');
    }
  });

  test('checkout callback and webhook for the same payment activate once', async () => {
    const { token } = await newTenant();
    const sub = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } });
    const orderId = sub.body.invoice.razorpayOrderId;
    const verify = await call(`/payments/${sub.body.invoice.id}/verify`, {
      token,
      body: { razorpayOrderId: orderId, razorpayPaymentId: 'pay_abc', razorpaySignature: signPayment(orderId, 'pay_abc') },
    });
    expect(verify.status).toBe(200);
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_abc', order_id: orderId } } } });
    for (let i = 0; i < 2; i++) {
      const hook = await call('/webhooks/razorpay', {
        body,
        headers: { 'x-razorpay-signature': hmacHex('test-webhook-secret', body) },
      });
      expect(hook.status).toBe(200);
    }
    expect((await call('/me/residencies', { token })).body).toHaveLength(1);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(4);
    const bad = await call('/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': 'nope' } });
    expect(bad.status).toBe(400);
  });

  test('webhook alone activates a pending plan', async () => {
    const { token } = await newTenant();
    const sub = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } });
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_w', order_id: sub.body.invoice.razorpayOrderId } } } });
    await call('/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': hmacHex('test-webhook-secret', body) } });
    expect((await call('/me/subscription', { token })).body.subscription.status).toBe('active');
  });

  test('other users cannot see or pay a bill', async () => {
    const { token } = await newTenant();
    const sub = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } });
    const other = await newTenant();
    expect((await call(`/payments/${sub.body.invoice.id}`, { token: other.token })).status).toBe(404);
    expect((await call(`/payments/${sub.body.invoice.id}/simulate`, { token: other.token, method: 'POST' })).status).toBe(404);
  });
});

describe('jobs', () => {
  test('unpaid pending plans expire after 30 minutes and release the bed', async () => {
    const { token } = await newTenant();
    const sub = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } });
    setClock('2026-11-10T06:29:00Z');
    expect((await runJobs()).expiredSubscriptions).toBe(0);
    setClock('2026-11-10T06:31:00Z');
    expect((await runJobs()).expiredSubscriptions).toBe(1);
    expect((await runJobs()).expiredSubscriptions).toBe(0);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
    expect((await call('/me/subscription', { token })).body).toBeNull();
    const late = await call(`/payments/${sub.body.invoice.id}/simulate`, { token, method: 'POST' });
    expect(late.body.error).toBe('invalid_state');
    // The tenant can subscribe again.
    expect((await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } })).status).toBe(201);
  });

  test('bills are generated 5 days ahead with skip credits from the right window, once', async () => {
    const { token } = await newTenant();
    await activeSubscriber(token, hostel.id, room.id, 'full');
    expect((await call('/me/skips', { token, body: { date: '2026-11-12', meal: 'lunch' } })).status).toBe(201);
    expect((await call('/me/skips', { token, body: { date: '2026-11-20', meal: 'breakfast' } })).status).toBe(201);
    expect((await call('/me/skips', { token, body: { date: '2026-12-07', meal: 'dinner' } })).status).toBe(201);

    setClock('2026-12-04T06:00:00Z');
    expect((await runJobs()).tenantInvoices).toBe(0);
    setClock('2026-12-05T06:00:00Z');
    expect((await runJobs()).tenantInvoices).toBe(1);
    expect((await runJobs()).tenantInvoices).toBe(0);
    let bills = (await call('/me/invoices', { token })).body;
    expect(bills[0]).toMatchObject({ periodStart: '2026-12-10', periodEnd: '2027-01-09', creditAmount: 130, totalAmount: 16000 - 130, dueDate: '2026-12-10' });

    // The 7 December skip falls after this bill's window, so it lands on the next one.
    setClock('2027-01-05T06:00:00Z');
    await runJobs();
    bills = (await call('/me/invoices', { token })).body;
    expect(bills[0]).toMatchObject({ periodStart: '2027-01-10', creditAmount: 80 });
  });

  test('a period bill unpaid more than 7 days after it is due shows as overdue', async () => {
    const { token } = await newTenant('Late Payer');
    await activeSubscriber(token, hostel.id, room.id, 'none');
    setClock('2026-12-05T06:00:00Z');
    await runJobs();
    setClock('2026-12-17T06:00:00Z');
    expect((await call('/me/invoices', { token })).body[0].isOverdue).toBe(false);
    setClock('2026-12-18T06:00:00Z');
    expect((await call('/me/invoices', { token })).body[0].isOverdue).toBe(true);
    const list = await call('/admin/invoices/overdue', { token: adminToken });
    expect(list.body).toHaveLength(1);
    expect(list.body[0].userName).toBe('Late Payer');
  });
});

describe('cancel', () => {
  test('pending plans cancel at once and free the bed', async () => {
    const { token } = await newTenant();
    await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'full' } });
    const res = await call('/me/subscription/cancel', { token, method: 'POST' });
    expect(res.body.status).toBe('cancelled');
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
    expect((await call('/me/subscription/cancel', { token, method: 'POST' })).status).toBe(404);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
  });

  test('active plans end with the paid period; cancelling twice frees one bed', async () => {
    const { token } = await newTenant();
    await activeSubscriber(token, hostel.id, room.id);
    setClock('2026-12-05T06:00:00Z');
    await runJobs(); // generates the December bill
    setClock('2026-12-06T06:00:00Z');
    const first = await call('/me/subscription/cancel', { token, method: 'POST' });
    expect(first.body).toMatchObject({ status: 'active', cancelAt: '2026-12-09' });
    const second = await call('/me/subscription/cancel', { token, method: 'POST' });
    expect(second.body.cancelAt).toBe('2026-12-09');
    // The bill for after the end date is voided.
    expect((await call('/me/invoices', { token })).body).toHaveLength(1);

    setClock('2026-12-09T06:00:00Z');
    expect((await runJobs()).endedSubscriptions).toBe(0);
    setClock('2026-12-10T06:00:00Z');
    expect((await runJobs()).endedSubscriptions).toBe(1);
    expect((await runJobs()).endedSubscriptions).toBe(0);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(5);
    const residencies = (await call('/me/residencies', { token })).body;
    expect(residencies[0]).toMatchObject({ status: 'ended', endDate: '2026-12-09' });
  });
});
