import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { hmacHex } from '../src/lib/crypto';
import { signPayment } from '../src/lib/razorpay';
import { runJobs } from '../src/services/jobs';
import { admin, liveHostel, liveSubscriber, newOwner, newTenant, nextPaymentId, payByCheckout, roomBeds, withRazorpay } from './fixtures';
import { call, resetDb } from './helpers';

// Edge case M1: a seeker pays at minute 29 and the payment reaches us at minute 31, after the job expired the plan,
// voided its bill and freed the bed. The money must never be lost: revive the plan if the bed is still free,
// otherwise record a refund that an admin sees and marks refunded, and tell the payer.

let ownerToken: string;
let adminToken: string;
let hostel: { id: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-10T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true, rooms: [{ sharing: '2-sharing', monthlyRent: 10000, totalBeds: 3, bedsAvailable: 3 }] });
  hostel = h.hostel;
  room = h.rooms[0];
});

afterEach(() => setClock(null));

function webhook(orderId: string, paymentId: string) {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
  return call('/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': hmacHex('test-webhook-secret', body) } });
}

/** The checkout callback for a payment, as the browser would send it after Razorpay Checkout. */
function callback(token: string, invoiceId: string, orderId: string, paymentId: string) {
  return call(`/payments/${invoiceId}/verify`, {
    token,
    body: { razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signPayment(orderId, paymentId) },
  });
}

/** Subscribes with live Razorpay keys and opens checkout: the bed is held and an order exists, nothing is paid yet. */
async function holdBed(token: string) {
  return withRazorpay('live', async () => {
    const sub = await call(`/hostels/${hostel.id}/subscribe`, { token, body: { roomTypeId: room.id, mealPlan: 'none', diet: 'veg' } });
    expect(sub.status).toBe(201);
    const order = await call(`/payments/${sub.body.invoice.id}/order`, { token, method: 'POST' });
    return { subscriptionId: sub.body.subscription.id as string, invoiceId: sub.body.invoice.id as string, orderId: order.body.orderId as string };
  });
}

/** The 30-minute hold runs out and the job expires the plan. */
async function holdExpires() {
  setClock('2026-11-10T06:31:00Z');
  expect((await runJobs()).expiredSubscriptions).toBeGreaterThan(0);
}

const exceptions = async () => (await call('/admin/payment-exceptions', { token: adminToken })).body as Record<string, unknown>[];

describe('a payment that lands after its bill stopped being payable', () => {
  test('revives the plan when a bed is still free, once, however many times it is delivered', async () => {
    const t = await newTenant();
    const hold = await holdBed(t.token);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(2);
    await holdExpires();
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(3);
    expect((await call(`/payments/${hold.invoiceId}`, { token: t.token })).body.status).toBe('void');

    const paymentId = nextPaymentId();
    await withRazorpay('live', async () => {
      expect((await webhook(hold.orderId, paymentId)).status).toBe(200);
      // The checkout callback for the same payment, and a webhook retry, change nothing more.
      const late = await callback(t.token, hold.invoiceId, hold.orderId, paymentId);
      expect(late.status).toBe(200);
      expect(late.body).toMatchObject({ status: 'paid', refund: null });
      expect((await webhook(hold.orderId, paymentId)).status).toBe(200);
    });

    const me = (await call('/me/subscription', { token: t.token })).body;
    expect(me.subscription).toMatchObject({ id: hold.subscriptionId, status: 'active' });
    expect(me.invoices[0]).toMatchObject({ id: hold.invoiceId, status: 'paid', paymentMode: 'razorpay_live', razorpayPaymentId: paymentId });
    expect((await call('/me/residencies', { token: t.token })).body).toHaveLength(1);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(2);
    expect(await exceptions()).toEqual([]);
  });

  test('when the bed went meanwhile: one refund-due record, the payer is told, an admin marks it refunded', async () => {
    const t = await newTenant();
    const hold = await holdBed(t.token);
    await holdExpires();
    // Others take every bed while the payment is on its way.
    for (let i = 0; i < 3; i++) await liveSubscriber((await newTenant()).token, hostel.id, room.id, 'none');
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(0);

    const paymentId = nextPaymentId();
    await withRazorpay('live', async () => {
      expect((await webhook(hold.orderId, paymentId)).status).toBe(200);
      expect((await webhook(hold.orderId, paymentId)).status).toBe(200);
      // The payer's own callback lands last: told at once, not shown an error.
      const late = await callback(t.token, hold.invoiceId, hold.orderId, paymentId);
      expect(late.status).toBe(200);
      expect(late.body).toMatchObject({ status: 'void', refund: { amount: 10000, reason: 'bed_taken', status: 'refund_due', paymentMode: 'razorpay_live', razorpayPaymentId: paymentId } });
    });

    // Nothing was revived: no plan, no residency, no bed taken.
    expect((await call('/me/subscription', { token: t.token })).body).toBeNull();
    expect((await call('/me/residencies', { token: t.token })).body).toHaveLength(0);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(0);

    const owed = await exceptions();
    expect(owed).toHaveLength(1);
    expect(owed[0]).toMatchObject({ billKind: 'tenant', billId: hold.invoiceId, amount: 10000, status: 'refund_due', payer: { id: expect.any(String), phone: t.phone } });
    expect((await call('/admin/stats', { token: adminToken })).body.refundsDue).toBe(1);
    expect((await call('/admin/payment-exceptions', { token: t.token })).status).toBe(403);

    const refunded = await call(`/admin/payment-exceptions/${owed[0]!.id}/refunded`, { token: adminToken, body: { note: 'Refunded in Razorpay, rfnd_00001' } });
    expect(refunded.status).toBe(200);
    expect(refunded.body).toMatchObject({ status: 'refunded', refundNote: 'Refunded in Razorpay, rfnd_00001', refundedAt: expect.any(String) });
    const again = await call(`/admin/payment-exceptions/${owed[0]!.id}/refunded`, { token: adminToken, body: { note: 'twice' } });
    expect(again.status).toBe(409);
    expect((await call('/admin/stats', { token: adminToken })).body.refundsDue).toBe(0);
    const log = (await call('/admin/audit?action=payment.refunded', { token: adminToken })).body;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ targetType: 'payment_exception', targetId: owed[0]!.id });
    expect(log[0].summary).toContain(paymentId);

    // The payer sees it was refunded, without the team's note.
    const page = (await call(`/payments/${hold.invoiceId}`, { token: t.token })).body;
    expect(page.refund).toMatchObject({ status: 'refunded', refundNote: null });
    expect((await call(`/payments/${hold.invoiceId}`, { token: adminToken })).body.refund.refundNote).toBe('Refunded in Razorpay, rfnd_00001');
  });

  test('a payer who started another plan meanwhile is refunded rather than given two plans', async () => {
    const t = await newTenant();
    const hold = await holdBed(t.token);
    await holdExpires();
    await liveSubscriber(t.token, hostel.id, room.id, 'none');

    await withRazorpay('live', async () => expect((await webhook(hold.orderId, nextPaymentId())).status).toBe(200));
    expect((await exceptions()).map((e) => e.reason)).toEqual(['has_other_plan']);
    expect((await call('/me/residencies', { token: t.token })).body).toHaveLength(1);
  });

  test('a plan the payer cancelled is not revived', async () => {
    const t = await newTenant();
    const hold = await holdBed(t.token);
    expect((await call('/me/subscription/cancel', { token: t.token, method: 'POST' })).body.status).toBe('cancelled');

    await withRazorpay('live', async () => expect((await webhook(hold.orderId, nextPaymentId())).status).toBe(200));
    expect((await exceptions()).map((e) => e.reason)).toEqual(['bill_cancelled']);
    expect((await call('/me/subscription', { token: t.token })).body).toBeNull();
  });

  test('a second payment for a bill that is already paid is refunded', async () => {
    const t = await newTenant();
    const sub = await liveSubscriber(t.token, hostel.id, room.id, 'none');
    const orderId = (await call(`/payments/${sub.invoice.id}`, { token: t.token })).body.invoice.razorpayOrderId;
    const second = nextPaymentId();
    await withRazorpay('live', async () => expect((await webhook(orderId, second)).status).toBe(200));
    expect(await exceptions()).toMatchObject([{ reason: 'duplicate_payment', razorpayPaymentId: second, amount: 10000 }]);
    // The bill keeps its first payment.
    expect((await call(`/payments/${sub.invoice.id}`, { token: t.token })).body.invoice.razorpayPaymentId).not.toBe(second);
  });

  test('deliveries of the same late payment arriving together settle it exactly once', async () => {
    // A bed is free: one revival.
    const a = await newTenant();
    const holdA = await holdBed(a.token);
    // No bed for b: one refund record.
    const b = await newTenant();
    const holdB = await holdBed(b.token);
    await holdExpires();
    for (let i = 0; i < 2; i++) await liveSubscriber((await newTenant()).token, hostel.id, room.id, 'none');
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(1);

    const payA = nextPaymentId();
    const payB = nextPaymentId();
    await withRazorpay('live', async () => {
      const results = await Promise.all([
        webhook(holdA.orderId, payA),
        callback(a.token, holdA.invoiceId, holdA.orderId, payA),
        webhook(holdA.orderId, payA),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    });
    expect((await call('/me/subscription', { token: a.token })).body.subscription.status).toBe('active');
    expect((await call('/me/residencies', { token: a.token })).body).toHaveLength(1);
    expect(await roomBeds(ownerToken, hostel.id, room.id)).toBe(0);

    await withRazorpay('live', async () => {
      const results = await Promise.all([webhook(holdB.orderId, payB), callback(b.token, holdB.invoiceId, holdB.orderId, payB), webhook(holdB.orderId, payB)]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    });
    expect(await exceptions()).toMatchObject([{ reason: 'bed_taken', razorpayPaymentId: payB }]);
  });

  test('owner bills: a payment for a bill waived or dropped before it arrived is refunded, and the bill stays as it was', async () => {
    setClock('2026-12-10T06:00:00Z');
    await runJobs(); // the first plan bill after the free month
    const bill = (await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken })).body.bills.find((b: { status: string }) => b.status === 'due');
    const paymentId = nextPaymentId();
    await withRazorpay('live', async () => {
      const order = await call(`/payments/${bill.id}/order`, { token: ownerToken, method: 'POST' });
      // An admin waives the bill while the owner is paying it.
      expect((await call(`/admin/owner-invoices/${bill.id}/void`, { token: adminToken, body: { reason: 'Goodwill month' } })).status).toBe(200);
      const late = await callback(ownerToken, bill.id, order.body.orderId, paymentId);
      expect(late.status).toBe(200);
      expect(late.body).toMatchObject({ kind: 'owner', status: 'void', refund: { amount: 1999, reason: 'bill_waived', status: 'refund_due' } });
      expect((await webhook(order.body.orderId, paymentId)).status).toBe(200);
    });
    expect(await exceptions()).toMatchObject([{ billKind: 'owner', billId: bill.id, reason: 'bill_waived', amount: 1999 }]);
    const after = (await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken })).body.bills.find((b: { id: string }) => b.id === bill.id);
    expect(after).toMatchObject({ status: 'void', paymentMode: 'waived', paidAt: null });
    // Never revenue.
    expect((await call('/admin/stats', { token: adminToken })).body.revenue).toMatchObject({ ownerPlans: 0, notCounted: { owner: { simulated: 0, test: 0 } } });
  });

  test('two tabs opening checkout for the same bill both pay the one order the bill points at', async () => {
    setClock('2026-12-10T06:00:00Z');
    await runJobs();
    const bill = (await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken })).body.bills.find((b: { status: string }) => b.status === 'due');
    expect(bill.razorpayOrderId).toBeNull();
    // Razorpay answers both tabs only once both have asked, so both create an order before either stores one.
    let asked = 0;
    let release = () => {};
    const bothAsked = new Promise<void>((resolve) => {
      release = resolve;
      setTimeout(resolve, 3000);
    });
    const latch = async () => {
      if (++asked === 2) release();
      await bothAsked;
    };
    const [one, two] = await withRazorpay(
      'live',
      () => Promise.all([call(`/payments/${bill.id}/order`, { token: ownerToken, method: 'POST' }), call(`/payments/${bill.id}/order`, { token: ownerToken, method: 'POST' })]),
      { beforeOrderReply: latch },
    );
    expect(asked).toBe(2);
    expect(one.body.orderId).toBe(two.body.orderId);
    expect((await call(`/payments/${bill.id}`, { token: ownerToken })).body.invoice.razorpayOrderId).toBe(one.body.orderId);
    await withRazorpay('live', () => payByCheckout(ownerToken, bill.id));
    expect((await call(`/payments/${bill.id}`, { token: ownerToken })).body.status).toBe('paid');
  });

  test('an order nobody knows is acknowledged and logged, so Razorpay stops retrying', async () => {
    const res = await webhook('order_NobodyKnows01', nextPaymentId());
    expect(res.status).toBe(200);
    expect(await exceptions()).toEqual([]);
  });
});
