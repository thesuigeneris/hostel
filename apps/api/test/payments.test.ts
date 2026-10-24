import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { istDate, newId } from '@hostels/shared';
import { db, schema } from '../src/db';
import { hmacSha256Hex } from '../src/lib/crypto';
import { createHostel, login, req, truncateAll } from './helpers';

beforeEach(truncateAll);
afterEach(() => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

async function pendingSubscription() {
  const o = await login('owner');
  const { hostel, roomType } = await createHostel(o.user.id, { name: 'Sunrise' });
  const t = await login('tenant', undefined, 'Asha');
  const s = await req('POST', '/subscriptions', {
    token: t.token,
    body: { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'full', diet: 'veg' },
  });
  return { owner: o, hostel, roomType, tenant: t, sub: s.body.subscription, invoice: s.body.invoice };
}

async function saasInvoice(ownerId: string, hostelId: string) {
  const [row] = await db
    .insert(schema.saasInvoices)
    .values({ id: newId('sin'), hostelId, ownerId, plan: 'pro', periodMonth: istDate().slice(0, 7), amount: 999, dueDate: istDate() })
    .returning();
  return row!;
}

describe('tenant invoice payments', () => {
  test('checkout returns stub mode details; only the payer can see it', async () => {
    const { tenant, invoice } = await pendingSubscription();
    const r = await req('GET', `/payments/${invoice.id}/checkout`, { token: tenant.token });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      mode: 'stub',
      razorpayKeyId: 'rzp_test_stub',
      razorpayOrderId: invoice.razorpayOrderId,
      amountPaise: 15000 * 100,
      payer: { name: 'Asha' },
      invoice: { id: invoice.id, status: 'due' },
    });
    expect(r.body.description).toContain('Sunrise');
    const other = await login();
    expect((await req('GET', `/payments/${invoice.id}/checkout`, { token: other.token })).status).toBe(404);
    expect((await req('GET', `/payments/${invoice.id}/checkout`)).status).toBe(401);
    expect((await req('GET', '/payments/xyz_1/checkout', { token: tenant.token })).status).toBe(404);
  });

  test('simulate activates the subscription and creates the residency; second pay is rejected', async () => {
    const { tenant, invoice, sub, hostel } = await pendingSubscription();
    const r = await req('POST', `/payments/${invoice.id}/simulate`, { token: tenant.token });
    expect(r.status).toBe(200);
    expect(r.body.invoice.status).toBe('paid');
    expect(r.body.invoice.paidAt).not.toBeNull();
    const stay = await req('GET', '/me/stay', { token: tenant.token });
    expect(stay.body.subscription.status).toBe('active');
    const res = await db.select().from(schema.residencies).where(eq(schema.residencies.subscriptionId, sub.id));
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ hostelId: hostel.id, status: 'active', source: 'subscription', startDate: sub.startDate });
    const again = await req('POST', `/payments/${invoice.id}/simulate`, { token: tenant.token });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('invoice_already_paid');
  });

  test('simulate is refused in live mode; verify checks the signature', async () => {
    const { tenant, invoice } = await pendingSubscription();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'secret123';
    expect((await req('POST', `/payments/${invoice.id}/simulate`, { token: tenant.token })).status).toBe(403);

    const bad = await req('POST', `/payments/${invoice.id}/verify`, {
      token: tenant.token,
      body: { razorpayOrderId: invoice.razorpayOrderId, razorpayPaymentId: 'pay_1', razorpaySignature: 'deadbeef' },
    });
    expect(bad.body.error).toBe('signature_invalid');
    const wrongOrder = await req('POST', `/payments/${invoice.id}/verify`, {
      token: tenant.token,
      body: { razorpayOrderId: 'order_other', razorpayPaymentId: 'pay_1', razorpaySignature: hmacSha256Hex('secret123', 'order_other|pay_1') },
    });
    expect(wrongOrder.body.error).toBe('signature_invalid');

    const good = await req('POST', `/payments/${invoice.id}/verify`, {
      token: tenant.token,
      body: { razorpayOrderId: invoice.razorpayOrderId, razorpayPaymentId: 'pay_1', razorpaySignature: hmacSha256Hex('secret123', `${invoice.razorpayOrderId}|pay_1`) },
    });
    expect(good.status).toBe(200);
    expect(good.body).toMatchObject({ mode: 'live', invoice: { status: 'paid' } });
  });

  test('expired (void) invoice cannot be paid', async () => {
    const { tenant, invoice } = await pendingSubscription();
    await db.update(schema.invoices).set({ status: 'void' }).where(eq(schema.invoices.id, invoice.id));
    const r = await req('POST', `/payments/${invoice.id}/simulate`, { token: tenant.token });
    expect(r.status).toBe(400);
  });
});

describe('owner software invoices', () => {
  test('checkout + simulate flips the hostel to Pro; tenants cannot pay it', async () => {
    const o = await login('owner');
    const { hostel } = await createHostel(o.user.id, { partnerStatus: 'none' });
    const sin = await saasInvoice(o.user.id, hostel.id);
    const c = await req('GET', `/payments/${sin.id}/checkout`, { token: o.token });
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ mode: 'stub', amountPaise: 99900, invoice: { id: sin.id, totalAmount: 999, status: 'due' } });
    expect(c.body.razorpayOrderId).toMatch(/^order_stub_/);
    expect(c.body.description).toContain('Hostels Pro');

    const t = await login();
    expect((await req('POST', `/payments/${sin.id}/simulate`, { token: t.token })).status).toBe(404);

    const p = await req('POST', `/payments/${sin.id}/simulate`, { token: o.token });
    expect(p.body.invoice.status).toBe('paid');
    const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostel.id));
    expect(h!.ownerPlan).toBe('pro');
  });
});

describe('razorpay webhook', () => {
  const sign = (body: string) => hmacSha256Hex('whsec', body);

  test('rejects bad signatures', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';
    const r = await req('POST', '/webhooks/razorpay', { body: '{}', headers: { 'x-razorpay-signature': 'nope' } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('signature_invalid');
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const unset = await req('POST', '/webhooks/razorpay', { body: '{}', headers: { 'x-razorpay-signature': sign('{}') } });
    expect(unset.status).toBe(400);
  });

  test('payment.captured pays a tenant invoice idempotently', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';
    const { tenant, invoice } = await pendingSubscription();
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_wh', order_id: invoice.razorpayOrderId } } } });
    const first = await req('POST', '/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': sign(body) } });
    expect(first.body).toEqual({ ok: true, result: 'paid' });
    const second = await req('POST', '/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': sign(body) } });
    expect(second.body).toEqual({ ok: true, result: 'already' });
    expect((await req('GET', '/me/stay', { token: tenant.token })).body.subscription.status).toBe('active');
    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoice.id));
    expect(inv!.razorpayPaymentId).toBe('pay_wh');
  });

  test('order.paid pays a saas invoice; unknown orders are ignored', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';
    const o = await login('owner');
    const { hostel } = await createHostel(o.user.id);
    const sin = await saasInvoice(o.user.id, hostel.id);
    await db.update(schema.saasInvoices).set({ razorpayOrderId: 'order_saas_1' }).where(eq(schema.saasInvoices.id, sin.id));
    const body = JSON.stringify({ event: 'order.paid', payload: { order: { entity: { id: 'order_saas_1' } }, payment: { entity: { id: 'pay_s' } } } });
    expect((await req('POST', '/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': sign(body) } })).body.result).toBe('paid');
    const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, hostel.id));
    expect(h!.ownerPlan).toBe('pro');
    const unknown = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'p', order_id: 'order_nope' } } } });
    expect((await req('POST', '/webhooks/razorpay', { body: unknown, headers: { 'x-razorpay-signature': sign(unknown) } })).body.result).toBe('unknown');
    const other = JSON.stringify({ event: 'refund.created' });
    expect((await req('POST', '/webhooks/razorpay', { body: other, headers: { 'x-razorpay-signature': sign(other) } })).body.result).toBe('ignored');
  });
});
