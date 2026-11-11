import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PARTNER_STANDARD_IDS } from '@hostels/shared';
import { setClock } from '../src/lib/clock';
import { hmacHex } from '../src/lib/crypto';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, nextPaymentId, withRazorpay } from './fixtures';
import { call, resetDb } from './helpers';

// Owner persona: what owners pay us. Upgrades never charge twice (M8), one free month per hostel (M9), the 15-day
// pause (M10), and a payment racing a waiver (O8).

type Bill = { id: string; plan: string; periodStart: string; periodEnd: string; amount: number; creditAmount: number; note: string | null; status: string; dueDate: string; paymentMode: string | null };

let ownerToken: string;
let adminToken: string;
let hostelId: string;

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  hostelId = (await liveHostel(ownerToken, adminToken)).hostel.id;
});

afterEach(() => setClock(null));

const at = (day: string) => setClock(`${day}T06:00:00Z`);
const plan = async () => (await call(`/owner/hostels/${hostelId}/plan`, { token: ownerToken })).body as { plan: { plan: string; startDate: string; trialEndsOn: string; suspended: boolean; pendingPlanOn: string | null }; inTrial: boolean; bills: Bill[] };
const bills = async () => (await plan()).bills;
const pay = async (id: string) => expect((await call(`/payments/${id}/simulate`, { token: ownerToken, method: 'POST' })).body.status).toBe('paid');
const choose = (p: string) => call(`/owner/hostels/${hostelId}/plan`, { token: ownerToken, body: { plan: p } });

/** Pro from 9 Nov (free until 9 Dec); the 9 Dec – 8 Jan bill is issued on 4 Dec and paid, or left unpaid. */
async function proWithDecemberBill(paid: boolean) {
  expect((await choose('pro')).status).toBe(200);
  at('2026-12-04');
  await runJobs();
  const dec = (await bills()).find((b) => b.periodStart === '2026-12-09')!;
  expect(dec).toMatchObject({ plan: 'pro', amount: 999, periodEnd: '2027-01-08', status: 'due' });
  if (paid) await pay(dec.id);
  return dec;
}

/** Applies for Partner and has the admin verify it on `day`. */
async function verifyPartnerOn(day: string) {
  expect((await choose('partner')).status).toBe(200);
  at(day);
  // Verifying needs every brand standard ticked (admin must-fix 1).
  const v = await call(`/admin/hostels/${hostelId}/partner/verify`, { token: adminToken, body: { platformFeePct: 10, checklist: PARTNER_STANDARD_IDS } });
  expect(v.status).toBe(200);
}

const partnerBill = async () => (await bills()).find((b) => b.plan === 'partner' && b.status !== 'void')!;

describe('upgrading never charges twice for the same days (M8)', () => {
  // The paid Pro month runs 9 Dec – 8 Jan: 31 days at ₹999.
  for (const [day, unused, label] of [
    ['2026-12-09', 31, 'on its first day'],
    ['2026-12-24', 16, 'in the middle'],
    ['2027-01-08', 1, 'on its last day'],
  ] as const) {
    test(`Pro → Partner ${label}: the unused paid Pro days come off the first Partner bill`, async () => {
      await proWithDecemberBill(true);
      await verifyPartnerOn(day);
      const credit = Math.round((999 * unused) / 31);
      const p = await partnerBill();
      expect(p).toMatchObject({ periodStart: day, amount: 1999 - credit, creditAmount: credit, dueDate: day, status: 'due' });
      expect(p.note).toContain('Credit for unused Pro days');
      // The paid Pro bill stays paid, and the job never adds a second Partner bill for the month.
      expect((await bills()).find((b) => b.periodStart === '2026-12-09' && b.plan === 'pro')).toMatchObject({ status: 'paid' });
      await runJobs();
      expect((await bills()).filter((b) => b.plan === 'partner' && b.status !== 'void')).toHaveLength(1);
    });
  }

  test('an unpaid Pro month is cut to the days used and keeps its due date; no credit', async () => {
    const dec = await proWithDecemberBill(false);
    await verifyPartnerOn('2026-12-24');
    const all = await bills();
    expect(all.find((b) => b.id === dec.id)).toMatchObject({ status: 'void', paymentMode: null });
    const used = all.find((b) => b.plan === 'pro' && b.status === 'due')!;
    expect(used).toMatchObject({ periodStart: '2026-12-09', periodEnd: '2026-12-23', amount: Math.round((999 * 15) / 31), dueDate: '2026-12-09' });
    expect(used.note).toContain('Pro days used before the upgrade');
    expect(await partnerBill()).toMatchObject({ amount: 1999, creditAmount: 0, note: null });
  });

  test('a waived Pro month earns no credit; only money paid is credited', async () => {
    const dec = await proWithDecemberBill(false);
    at('2026-12-10');
    expect((await call(`/admin/owner-invoices/${dec.id}/void`, { token: adminToken, body: { reason: 'Goodwill month' } })).status).toBe(200);
    await verifyPartnerOn('2026-12-24');
    expect(await partnerBill()).toMatchObject({ amount: 1999, creditAmount: 0 });
  });

  test('paid with real money (Razorpay live) is credited the same way', async () => {
    const dec = await proWithDecemberBill(false);
    await withRazorpay('live', async () => {
      const order = await call(`/payments/${dec.id}/order`, { token: ownerToken, method: 'POST' });
      const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: nextPaymentId(), order_id: order.body.orderId } } } });
      expect((await call('/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': hmacHex('test-webhook-secret', body) } })).status).toBe(200);
    });
    expect((await bills()).find((b) => b.id === dec.id)).toMatchObject({ status: 'paid', paymentMode: 'razorpay_live' });
    await verifyPartnerOn('2026-12-24');
    expect(await partnerBill()).toMatchObject({ creditAmount: Math.round((999 * 16) / 31) });
  });

  test('a month paid early is credited in full, on top of the rest of this month', async () => {
    await proWithDecemberBill(true);
    at('2027-01-04');
    await runJobs();
    const jan = (await bills()).find((b) => b.periodStart === '2027-01-09')!;
    await pay(jan.id);
    await verifyPartnerOn('2027-01-06');
    const credit = Math.round((999 * 3) / 31) + 999;
    expect(await partnerBill()).toMatchObject({ periodStart: '2027-01-06', amount: 1999 - credit, creditAmount: credit });
  });

  test('upgrading inside the free month bills nothing until it ends, and gives no credit', async () => {
    expect((await choose('pro')).status).toBe(200);
    await verifyPartnerOn('2026-11-20');
    expect(await bills()).toEqual([]);
    expect((await plan()).plan).toMatchObject({ plan: 'partner', trialEndsOn: '2026-12-09' });
    at('2026-12-04');
    await runJobs();
    expect(await partnerBill()).toMatchObject({ periodStart: '2026-12-09', amount: 1999, creditAmount: 0 });
  });
});

describe('one free month per hostel (M9)', () => {
  test('downgrading in the free month and upgrading again keeps the original end of the free month', async () => {
    expect((await choose('pro')).status).toBe(200);
    at('2026-11-20');
    expect((await choose('free')).body.plan.plan).toBe('free');
    expect((await plan()).inTrial).toBe(false);
    at('2026-11-30');
    const again = await choose('pro');
    expect(again.body).toMatchObject({ inTrial: true, plan: { plan: 'pro', trialEndsOn: '2026-12-09' } });
    at('2026-12-04');
    await runJobs();
    // Billing starts when the one free month ends (9 Dec), not a month after the second switch (30 Dec).
    expect(await bills()).toMatchObject([{ plan: 'pro', periodStart: '2026-12-09', amount: 999 }]);
  });

  test('after the free month, switching back to a paid plan bills at once', async () => {
    expect((await choose('pro')).status).toBe(200);
    at('2026-11-20');
    await choose('free');
    at('2026-12-15');
    const up = await choose('pro');
    expect(up.body.inTrial).toBe(false);
    expect(up.body.bills).toMatchObject([{ plan: 'pro', periodStart: '2026-12-15', amount: 999, dueDate: '2026-12-15', status: 'due' }]);
  });
});

describe('downgrades', () => {
  test('a downgrade after paying next month early waits for the end of that month', async () => {
    await proWithDecemberBill(true);
    at('2027-01-04');
    await runJobs();
    const jan = (await bills()).find((b) => b.periodStart === '2027-01-09')!;
    await pay(jan.id);
    at('2027-01-06');
    expect((await choose('free')).body.plan).toMatchObject({ plan: 'pro', pendingPlan: 'free', pendingPlanOn: '2027-02-09' });
    at('2027-01-09');
    await runJobs();
    expect((await plan()).plan.plan).toBe('pro');
  });

  test('a downgrade requested after next month was billed drops that unpaid bill now', async () => {
    await proWithDecemberBill(true);
    at('2027-01-05');
    await runJobs();
    const jan = (await bills()).find((b) => b.periodStart === '2027-01-09')!;
    expect(jan.status).toBe('due');
    expect((await choose('free')).body.plan).toMatchObject({ pendingPlanOn: '2027-01-09' });
    expect((await bills()).find((b) => b.id === jan.id)!.status).toBe('void');
    // Calling the change off brings the bill back.
    await choose('pro');
    await runJobs();
    expect((await bills()).filter((b) => b.periodStart === '2027-01-09' && b.status === 'due')).toHaveLength(1);
  });
});

describe('the 15-day pause (M10)', () => {
  test('15 days past due still works; day 16 pauses; paying on day 16 restores at once', async () => {
    const dec = await proWithDecemberBill(false);
    const roster = () => call(`/owner/hostels/${hostelId}/residents`, { token: ownerToken, body: { phone: '9811100001', monthlyRent: 5000, startDate: '2026-11-01' } });
    at('2026-12-24'); // 15 days after the 9 Dec due date
    await runJobs();
    expect((await plan()).plan.suspended).toBe(false);
    const insights = (await call(`/owner/hostels/${hostelId}/insights`, { token: ownerToken })).body;
    expect(insights.planBill).toMatchObject({ due: 999, suspended: false, oldest: { id: dec.id, isOverdue: true, pausesOn: '2026-12-25' } });
    at('2026-12-25'); // day 16
    await runJobs();
    expect((await plan()).plan.suspended).toBe(true);
    expect((await roster()).body).toMatchObject({ error: 'plan_required', message: expect.stringContaining('overdue') });
    await pay(dec.id);
    // No job run needed: paying lifts the pause straight away.
    expect((await plan()).plan.suspended).toBe(false);
    expect((await roster()).status).toBe(201);
  });

  test('a paused Partner keeps serving its subscribers but takes no new ones', async () => {
    const owner = await newOwner();
    const { hostel, rooms } = await liveHostel(owner, adminToken, { partner: true });
    const sub = await newTenant('Existing');
    await activeSubscriber(sub.token, hostel.id, rooms[0].id);
    at('2026-12-04');
    await runJobs();
    const partnerPlan = (await call(`/owner/hostels/${hostel.id}/plan`, { token: owner })).body;
    expect(partnerPlan.bills).toMatchObject([{ plan: 'partner', periodStart: '2026-12-09', status: 'due' }]);
    at('2026-12-25');
    await runJobs();
    expect((await call(`/owner/hostels/${hostel.id}/plan`, { token: owner })).body.plan.suspended).toBe(true);

    // New subscriptions are refused and the badge is gone from the public page.
    const seeker = await newTenant('New');
    expect((await call(`/hostels/${hostel.id}/subscribe`, { token: seeker.token, body: { roomTypeId: rooms[0].id, mealPlan: 'full' } })).status).toBe(409);
    expect((await call(`/hostels/${hostel.slug}`)).body.isVerified).toBe(false);
    // The existing subscriber is still billed, can skip a meal, and the kitchen still sees them.
    const mine = (await call('/me/subscription', { token: sub.token })).body;
    expect(mine.subscription.status).toBe('active');
    expect(mine.invoices.some((i: { periodStart: string }) => i.periodStart === '2026-12-09')).toBe(true);
    expect((await call('/me/skips', { token: sub.token, body: { date: '2026-12-27', meal: 'dinner' } })).status).toBe(201);
    const count = (await call(`/owner/hostels/${hostel.id}/headcount?date=2026-12-27`, { token: owner })).body.meals;
    expect(count.find((m: { meal: string }) => m.meal === 'dinner')).toMatchObject({ total: 0, skipped: 1 });
    expect(count.find((m: { meal: string }) => m.meal === 'lunch').total).toBe(1);
    // The weekly menu stays editable for them; the brand kit does not.
    const menu = await call(`/owner/hostels/${hostel.id}/menus/2026-12-28`, {
      token: owner,
      method: 'PUT',
      body: { theme: 'Winter week', items: [{ date: '2026-12-28', meal: 'lunch', vegDish: 'Dal khichdi' }] },
    });
    expect(menu.status).toBe(200);
    expect((await call(`/owner/hostels/${hostel.id}/brand-kit`, { token: owner })).status).toBe(402);
  });
});

describe('paying at the moment an admin waives (O8, owner side)', () => {
  test('one outcome every time: paid, or waived with the payment owed back; never both', async () => {
    for (let round = 0; round < 4; round++) {
      // A fresh unpaid bill each round: a new hostel on Pro after its free month.
      at('2026-11-09');
      const h = (await liveHostel(ownerToken, adminToken)).hostel.id;
      await call(`/owner/hostels/${h}/plan`, { token: ownerToken, body: { plan: 'pro' } });
      at('2026-12-04');
      await runJobs();
      const bill = (await call(`/owner/hostels/${h}/plan`, { token: ownerToken })).body.bills[0] as Bill;
      const paymentId = nextPaymentId();
      const [waive, paid] = await withRazorpay('live', async () => {
        const order = await call(`/payments/${bill.id}/order`, { token: ownerToken, method: 'POST' });
        const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: order.body.orderId } } } });
        return Promise.all([
          call(`/admin/owner-invoices/${bill.id}/void`, { token: adminToken, body: { reason: 'Goodwill month' } }),
          call('/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': hmacHex('test-webhook-secret', body) } }),
        ]);
      });
      expect(paid.status).toBe(200);
      const after = (await call(`/payments/${bill.id}`, { token: ownerToken })).body;
      if (after.status === 'paid') {
        expect(waive.status).toBe(409);
        expect(after.invoice.paymentMode).toBe('razorpay_live');
        expect(after.refund).toBeNull();
      } else {
        expect(waive.status).toBe(200);
        expect(after).toMatchObject({ status: 'void', invoice: { paymentMode: 'waived', paidAt: null }, refund: { reason: 'bill_waived', status: 'refund_due', amount: 999 } });
      }
    }
  });
});
