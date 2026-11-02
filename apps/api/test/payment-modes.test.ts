import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { newId } from '@hostels/shared';
import postgres from 'postgres';
import { getDb, schema } from '../src/db';
import { migrationsFolder } from '../src/db/migrate';
import { setClock } from '../src/lib/clock';
import { hmacHex } from '../src/lib/crypto';
import { env } from '../src/lib/env';
import { signPayment, STUB_SIGNATURE_SECRET } from '../src/lib/razorpay';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, checkoutOrderId, liveHostel, liveSubscriber, newOwner, newTenant, nextPaymentId, payByCheckout, withRazorpay } from './fixtures';
import { call, resetDb } from './helpers';

let ownerToken: string;
let adminToken: string;
let hostel: { id: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true, rooms: [{ sharing: '2-sharing', monthlyRent: 10000, totalBeds: 10, bedsAvailable: 10 }] });
  hostel = h.hostel;
  room = h.rooms[0];
});

afterEach(() => setClock(null));

function webhook(orderId: string, paymentId: string) {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
  return call('/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': hmacHex('test-webhook-secret', body) } });
}

/** Subscribes and opens checkout, as the pay page does: the bed is held and the bill has its payment order. */
async function subscribe(token: string, mealPlan = 'none', hostelId = hostel.id, roomTypeId = room.id) {
  const res = await call(`/hostels/${hostelId}/subscribe`, { token, body: { roomTypeId, mealPlan, diet: 'veg' } });
  expect(res.status).toBe(201);
  const sub = res.body as { subscription: { id: string }; invoice: { id: string } };
  return { ...sub, orderId: await checkoutOrderId(token, sub.invoice.id) };
}

const billOf = async (token: string, id: string) => (await call(`/payments/${id}`, { token })).body.invoice;

/** Run with some env vars set, restoring them afterwards (env is read lazily by the API). */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const apply = (v: Record<string, string | undefined>) => {
    for (const [k, value] of Object.entries(v)) {
      if (value === undefined) delete process.env[k];
      else process.env[k] = value;
    }
  };
  apply(vars);
  try {
    return await fn();
  } finally {
    apply(saved);
  }
}

/** Plan bills for the first month after the free one, for each partner hostel. */
async function ownerBillsDue() {
  setClock('2026-12-10T06:00:00Z');
  await runJobs();
  return (await call('/admin/owner-invoices?status=due', { token: adminToken })).body as { id: string; hostelId: string; ownerId: string; amount: number }[];
}

describe('payment modes', () => {
  test('every payment path records how the bill was paid', async () => {
    // No Razorpay keys: the simulate button, a stub-signed checkout and a webhook are all simulated.
    const a = await newTenant();
    const subA = await subscribe(a.token);
    expect((await call(`/payments/${subA.invoice.id}/simulate`, { token: a.token, method: 'POST' })).body.invoice).toMatchObject({ status: 'paid', paymentMode: 'simulated' });

    const b = await newTenant();
    const subB = await subscribe(b.token);
    const orderB = subB.orderId;
    const verified = await call(`/payments/${subB.invoice.id}/verify`, {
      token: b.token,
      body: { razorpayOrderId: orderB, razorpayPaymentId: 'pay_stubsigned1', razorpaySignature: signPayment(orderB, 'pay_stubsigned1') },
    });
    expect(verified.body.invoice).toMatchObject({ status: 'paid', paymentMode: 'simulated' });

    const c = await newTenant();
    const subC = await subscribe(c.token);
    expect((await webhook(subC.orderId, 'pay_hookstub1')).status).toBe(200);
    expect(await billOf(c.token, subC.invoice.id)).toMatchObject({ status: 'paid', paymentMode: 'simulated' });

    // Razorpay test keys never move money.
    const d = await newTenant();
    await withRazorpay('test', async () => {
      const sub = await subscribe(d.token);
      expect((await payByCheckout(d.token, sub.invoice.id)).invoice).toMatchObject({ status: 'paid', paymentMode: 'razorpay_test' });
    });

    // Live keys: checkout and webhook are real money.
    const e = await newTenant();
    const f = await newTenant();
    await withRazorpay('live', async () => {
      const sub = await subscribe(e.token);
      expect((await payByCheckout(e.token, sub.invoice.id)).invoice).toMatchObject({ status: 'paid', paymentMode: 'razorpay_live' });
      const subF = await subscribe(f.token);
      const order = await call(`/payments/${subF.invoice.id}/order`, { token: f.token, method: 'POST' });
      expect((await webhook(order.body.orderId, nextPaymentId())).status).toBe(200);
    });
    const billF = (await call('/me/subscription', { token: f.token })).body.invoices[0];
    expect(billF).toMatchObject({ status: 'paid', paymentMode: 'razorpay_live' });

    // An order the stub created stays simulated even when live keys are set before its payment lands.
    const g = await newTenant();
    const subG = await subscribe(g.token);
    await withRazorpay('live', async () => expect((await webhook(subG.orderId, nextPaymentId())).status).toBe(200));
    expect(await billOf(g.token, subG.invoice.id)).toMatchObject({ status: 'paid', paymentMode: 'simulated' });
  });

  test('owner bills: paid bills record the mode; a waived bill is void and marked waived, never paid', async () => {
    const owner2 = await newOwner();
    const owner3 = await newOwner();
    const h2 = await liveHostel(owner2, adminToken, { partner: true });
    const h3 = await liveHostel(owner3, adminToken, { partner: true });
    const bills = await ownerBillsDue();
    const of = (hostelId: string) => bills.find((b) => b.hostelId === hostelId)!;

    await withRazorpay('live', () => payByCheckout(ownerToken, of(hostel.id).id));
    expect((await call(`/payments/${of(h2.hostel.id).id}/simulate`, { token: owner2, method: 'POST' })).body.invoice).toMatchObject({ status: 'paid', paymentMode: 'simulated' });
    const waived = await call(`/admin/owner-invoices/${of(h3.hostel.id).id}/void`, { token: adminToken, body: { reason: 'Goodwill month' } });
    expect(waived.body).toMatchObject({ status: 'void', paymentMode: 'waived', paidAt: null });

    const all = (await call('/admin/owner-invoices', { token: adminToken })).body as { id: string; status: string; paymentMode: string | null }[];
    expect(all.find((b) => b.id === of(hostel.id).id)).toMatchObject({ status: 'paid', paymentMode: 'razorpay_live' });
    const onlyWaived = (await call('/admin/owner-invoices?mode=waived', { token: adminToken })).body;
    expect(onlyWaived.map((b: { id: string }) => b.id)).toEqual([of(h3.hostel.id).id]);
  });

  test('a live instance refuses simulated payments and stub signatures', async () => {
    const t = await newTenant();
    await withEnv({ NODE_ENV: 'production', APP_MODE: undefined }, async () => {
      // A production standard instance with no keys takes no payments at all, and never simulated ones.
      const stubSub = await subscribe(t.token);
      const refused = await call(`/payments/${stubSub.invoice.id}/simulate`, { token: t.token, method: 'POST' });
      expect(refused.status).toBe(403);
      expect(refused.body.error).toBe('forbidden');
      await call('/me/subscription/cancel', { token: t.token, method: 'POST' });

      await withRazorpay('live', async () => {
        expect(env.isProduction).toBe(true);
        expect((await call('/')).body).toMatchObject({ razorpay: 'live', payments: 'razorpay_live' });
        const sub = await subscribe(t.token);
        const simulate = await call(`/payments/${sub.invoice.id}/simulate`, { token: t.token, method: 'POST' });
        expect(simulate.status).toBe(403);
        expect(simulate.body.error).toBe('forbidden');
        // Anyone can compute a stub signature from the source, so a live instance never accepts one.
        const order = sub.orderId;
        const forged = await call(`/payments/${sub.invoice.id}/verify`, {
          token: t.token,
          body: { razorpayOrderId: order, razorpayPaymentId: 'pay_forged1', razorpaySignature: hmacHex(STUB_SIGNATURE_SECRET, `${order}|pay_forged1`) },
        });
        expect(forged.status).toBe(400);
        expect(forged.body.error).toBe('signature_invalid');
        expect(await billOf(t.token, sub.invoice.id)).toMatchObject({ status: 'due', paymentMode: null });
      });
    });
  });

  test('replayed webhooks never change how a paid bill was paid', async () => {
    const t = await newTenant();
    const paymentId = nextPaymentId();
    await withRazorpay('live', async () => {
      const sub = await subscribe(t.token);
      await payByCheckout(t.token, sub.invoice.id, paymentId);
      for (let i = 0; i < 2; i++) expect((await webhook(sub.orderId, paymentId)).status).toBe(200);
    });
    const me = (await call('/me/subscription', { token: t.token })).body;
    expect(me.invoices).toHaveLength(1);
    expect(me.invoices[0]).toMatchObject({ status: 'paid', paymentMode: 'razorpay_live', razorpayPaymentId: paymentId });
    expect((await call('/me/residencies', { token: t.token })).body).toHaveLength(1);
    expect((await call('/admin/payment-exceptions', { token: adminToken })).body).toEqual([]);
  });
});

describe('money figures count only real money', () => {
  /** One tenant each paying ₹10,000 with live Razorpay, with Razorpay test keys, and with the simulate button. */
  async function oneOfEach() {
    const live = await newTenant();
    const testMode = await newTenant();
    const simulated = await newTenant();
    await liveSubscriber(live.token, hostel.id, room.id, 'none');
    await withRazorpay('test', async () => payByCheckout(testMode.token, (await subscribe(testMode.token)).invoice.id));
    await activeSubscriber(simulated.token, hostel.id, room.id, 'none');
  }

  test('payouts pay out real money only, and drop a pending payout no real money is behind', async () => {
    await oneOfEach();
    // A second hostel whose only payments were simulated, with a pending payout built before payment modes existed.
    const other = await liveHostel(ownerToken, adminToken, { partner: true });
    await activeSubscriber((await newTenant()).token, other.hostel.id, other.rooms[0].id, 'none');
    await getDb()
      .insert(schema.payouts)
      .values({ id: newId('pay'), ownerId: other.hostel.ownerId, hostelId: other.hostel.id, periodMonth: '2026-11', grossAmount: 10000, platformFee: 1000, netAmount: 9000 });

    setClock('2026-12-02T06:00:00Z');
    const gen = await call('/admin/payouts/generate', { token: adminToken, body: { month: '2026-11' } });
    expect(gen.status).toBe(200);
    expect(gen.body).toHaveLength(1);
    expect(gen.body[0]).toMatchObject({ hostelId: hostel.id, grossAmount: 10000, platformFee: 1000, netAmount: 9000, status: 'pending' });
    expect((await call('/admin/payouts?month=2026-11', { token: adminToken })).body).toHaveLength(1);

    // The payouts page says what was left out of the month.
    const revenue = (await call('/admin/revenue?month=2026-11', { token: adminToken })).body;
    expect(revenue).toMatchObject({ month: '2026-11', subscriptionGross: 10000, platformFees: 1000, notCounted: { tenant: { simulated: 20000, test: 10000 } } });
  });

  test("the owner's payouts and insights count real money only and say what they left out", async () => {
    await oneOfEach();
    const payouts = (await call('/owner/payouts', { token: ownerToken })).body;
    expect(payouts.thisMonth).toEqual({
      month: '2026-11',
      hostels: [{ hostelId: hostel.id, hostelName: expect.any(String), grossAmount: 10000, platformFee: 1000, netAmount: 9000 }],
      notCounted: { simulated: 10000, test: 10000 },
    });
    const insights = (await call(`/owner/hostels/${hostel.id}/insights`, { token: ownerToken })).body;
    expect(insights.revenue).toMatchObject({ subscriptionGross: 10000, platformFee: 1000, subscriptionNet: 9000, notCounted: { simulated: 10000, test: 10000 } });
    // Another owner's simulated payments are not this owner's business.
    expect((await call('/owner/payouts', { token: await newOwner() })).body.thisMonth).toEqual({ month: '2026-11', hostels: [], notCounted: { simulated: 0, test: 0 } });
  });

  test('platform revenue: real money only; simulated and waived owner bills are never revenue', async () => {
    await oneOfEach();
    const nov = (await call('/admin/stats', { token: adminToken })).body.revenue;
    expect(nov).toEqual({
      month: '2026-11',
      subscriptionGross: 10000,
      platformFees: 1000,
      ownerPlans: 0,
      trialHostels: 1,
      notCounted: { tenant: { simulated: 10000, test: 10000 }, owner: { simulated: 0, test: 0 } },
    });

    const owner2 = await newOwner();
    const owner3 = await newOwner();
    const h2 = await liveHostel(owner2, adminToken, { partner: true });
    const h3 = await liveHostel(owner3, adminToken, { partner: true });
    const bills = await ownerBillsDue();
    const of = (hostelId: string) => bills.find((b) => b.hostelId === hostelId)!.id;
    await withRazorpay('live', () => payByCheckout(ownerToken, of(hostel.id)));
    await call(`/payments/${of(h2.hostel.id)}/simulate`, { token: owner2, method: 'POST' });
    await call(`/admin/owner-invoices/${of(h3.hostel.id)}/void`, { token: adminToken, body: { reason: 'Dispute settled' } });

    const dec = (await call('/admin/stats', { token: adminToken })).body.revenue;
    expect(dec).toEqual({
      month: '2026-12',
      subscriptionGross: 0,
      platformFees: 0,
      ownerPlans: 1999,
      trialHostels: 0,
      notCounted: { tenant: { simulated: 0, test: 0 }, owner: { simulated: 1999, test: 0 } },
    });
    // Asking for a month directly gives the same figures; November is unchanged.
    expect((await call('/admin/revenue?month=2026-11', { token: adminToken })).body).toMatchObject({ subscriptionGross: 10000, ownerPlans: 0 });
    expect((await call('/admin/revenue', { token: ownerToken })).status).toBe(403);
  });
});

describe('migration 0008', () => {
  test('backfills how old bills were paid, marks waived bills, and drops pending payouts built from them', async () => {
    const statements = readFileSync(`${migrationsFolder}/0008_payment_mode.sql`, 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim());
    const isBackfill = (s: string) => /^(--[^\n]*\n)*\s*(UPDATE|DELETE)\b/.test(s);
    const backfill = statements.filter(isBackfill);
    const checks = statements.filter((s) => /ADD CONSTRAINT "(owner_)?invoices_payment_mode_status" CHECK/.test(s));
    expect(backfill).toHaveLength(4);
    expect(checks).toHaveLength(2);
    // The backfill runs before the checks it has to satisfy.
    expect(statements.indexOf(backfill.at(-1)!)).toBeLessThan(statements.indexOf(checks[0]!));

    // Rows to backfill, made through the API so every reference is real.
    const [ownerBill] = await ownerBillsDue();
    const tenants = await Promise.all([1, 2, 3, 4, 5].map(() => newTenant()));
    const subs = [];
    for (const t of tenants) subs.push(await subscribe(t.token));
    const plan = (await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken })).body.plan;

    const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const rollback = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        // Back to the shape before 0008: no checks, no modes.
        await tx`ALTER TABLE invoices DROP CONSTRAINT invoices_payment_mode_status`;
        await tx`ALTER TABLE owner_invoices DROP CONSTRAINT owner_invoices_payment_mode_status`;
        const paid = async (id: string, orderId: string | null, paymentId: string | null) =>
          tx`UPDATE invoices SET status = 'paid', paid_at = now(), razorpay_order_id = ${orderId}, razorpay_payment_id = ${paymentId}, payment_mode = NULL WHERE id = ${id}`;
        await paid(subs[0]!.invoice.id, subs[0]!.orderId, null);
        await paid(subs[1]!.invoice.id, 'order_RealLooking001', 'pay_stub_abc123');
        await paid(subs[2]!.invoice.id, 'order_seed_abc', 'pay_seed_abc');
        await paid(subs[3]!.invoice.id, 'order_RealLooking002', 'pay_RealLooking002');
        // subs[4] stays due.

        await tx`UPDATE owner_invoices SET status = 'paid', paid_at = now(), razorpay_order_id = 'order_RealLooking003', razorpay_payment_id = 'pay_RealLooking003', payment_mode = NULL WHERE id = ${ownerBill!.id}`;
        const legacyOwnerBill = (id: string, status: string, start: string, paymentId: string | null) =>
          tx`INSERT INTO owner_invoices (id, owner_plan_id, hostel_id, owner_id, plan, period_start, period_end, amount, status, due_date, razorpay_payment_id, paid_at)
             VALUES (${id}, ${plan.id}, ${hostel.id}, ${ownerBill!.ownerId}, 'partner', ${start}, ${start}, 1999, ${status}, ${start}, ${paymentId}, ${status === 'paid' ? new Date() : null})`;
        await legacyOwnerBill('oin_legacywaived', 'void', '2027-01-09', null);
        await legacyOwnerBill('oin_legacyplanchg', 'void', '2027-02-09', null);
        await legacyOwnerBill('oin_legacynopayid', 'paid', '2027-03-09', null);
        await tx`INSERT INTO audit_events (id, action, target_type, target_id, summary) VALUES ('aud_legacy', 'owner_invoice.void', 'owner_invoice', 'oin_legacywaived', 'Waived')`;

        await tx`INSERT INTO payouts (id, owner_id, hostel_id, period_month, gross_amount, platform_fee, net_amount, status) VALUES
          ('pay_legacypending', ${ownerBill!.ownerId}, ${hostel.id}, '2026-10', 10000, 1000, 9000, 'pending'),
          ('pay_legacypaid', ${ownerBill!.ownerId}, ${hostel.id}, '2026-09', 10000, 1000, 9000, 'paid')`;

        for (const s of [...backfill, ...checks]) await tx.unsafe(s);

        const modes = async (table: 'invoices' | 'owner_invoices', ids: string[]) => {
          const rows = await tx.unsafe(`SELECT id, payment_mode FROM ${table} WHERE id = ANY($1)`, [ids]);
          return Object.fromEntries(rows.map((r) => [r.id, r.payment_mode]));
        };
        expect(await modes('invoices', subs.map((s) => s.invoice.id))).toEqual({
          [subs[0]!.invoice.id]: 'simulated', // paid with no payment id
          [subs[1]!.invoice.id]: 'simulated', // the stub's payment id
          [subs[2]!.invoice.id]: 'simulated', // the demo seed's ids
          [subs[3]!.invoice.id]: 'razorpay_test', // through Razorpay before any live account: never real money
          [subs[4]!.invoice.id]: null, // still due
        });
        expect(await modes('owner_invoices', [ownerBill!.id, 'oin_legacywaived', 'oin_legacyplanchg', 'oin_legacynopayid'])).toEqual({
          [ownerBill!.id]: 'razorpay_test',
          oin_legacywaived: 'waived',
          oin_legacyplanchg: null,
          oin_legacynopayid: 'simulated',
        });
        const payouts = await tx`SELECT id FROM payouts WHERE id IN ('pay_legacypending', 'pay_legacypaid')`;
        expect(payouts.map((r) => r.id)).toEqual(['pay_legacypaid']);
        throw rollback;
      });
    } catch (e) {
      if (e !== rollback) throw e;
    } finally {
      await sql.end();
    }
    // Rolled back: the checks are in place again.
    const constraints = await getDb().execute<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname IN ('invoices_payment_mode_status', 'owner_invoices_payment_mode_status') ORDER BY conname`,
    );
    expect([...constraints].map((r) => r.conname)).toEqual(['invoices_payment_mode_status', 'owner_invoices_payment_mode_status']);
  });
});
