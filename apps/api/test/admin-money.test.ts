import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { admin, liveHostel, newOwner } from './fixtures';
import { call, resetDb } from './helpers';
import { holdRow } from './latch';

let ownerToken: string;
let adminToken: string;

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
});

afterEach(() => setClock(null));

/** A Pro hostel whose first paid bill (after the free month) is due on 2026-12-09. */
async function proHostelWithBill(name = 'Lakeview PG') {
  const { hostel } = await liveHostel(ownerToken, adminToken, { name });
  expect((await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } })).status).toBe(200);
  setClock('2026-12-04T06:00:00Z');
  await runJobs();
  const plan = await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken });
  const bill = plan.body.bills.find((b: { status: string }) => b.status === 'due') as { id: string; dueDate: string; amount: number };
  expect(bill.dueDate).toBe('2026-12-09');
  return { hostel, bill };
}

const ownerBill = async (id: string) => (await getDb().select().from(schema.ownerInvoices).where(eq(schema.ownerInvoices.id, id)))[0]!;
const exceptions = () => getDb().select().from(schema.paymentExceptions);

describe('an admin waives an owner bill while the owner pays it (edge case O8)', () => {
  test('the payment lands first: the bill is paid and the waiver is refused with "refresh"', async () => {
    const { bill } = await proHostelWithBill();
    // Checkout already open, so paying is one conditional update of the bill.
    expect((await call(`/payments/${bill.id}/order`, { token: ownerToken, method: 'POST' })).status).toBe(200);

    const latch = await holdRow('owner_invoices', bill.id);
    const pay = call(`/payments/${bill.id}/simulate`, { token: ownerToken, method: 'POST' });
    await latch.queued(1);
    // The admin's page still shows the bill as due, so the waiver reads it as due and then queues behind the payment.
    const waive = call(`/admin/owner-invoices/${bill.id}/void`, { token: adminToken, body: { reason: 'Goodwill month' } });
    await latch.queued(2);
    await latch.release();
    const [paid, waived] = await Promise.all([pay, waive]);

    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('paid');
    expect(waived.status).toBe(409);
    expect(waived.body.message).toContain('refresh');
    expect(await ownerBill(bill.id)).toMatchObject({ status: 'paid', paymentMode: 'simulated' });
    expect(await exceptions()).toHaveLength(0);
    expect((await call('/admin/audit?action=owner_invoice.void', { token: adminToken })).body).toHaveLength(0);
  });

  test('the waiver lands first: the bill stays waived and the payment is recorded as a refund due', async () => {
    const { bill } = await proHostelWithBill();
    expect((await call(`/payments/${bill.id}/order`, { token: ownerToken, method: 'POST' })).status).toBe(200);

    const latch = await holdRow('owner_invoices', bill.id);
    const waive = call(`/admin/owner-invoices/${bill.id}/void`, { token: adminToken, body: { reason: 'Goodwill month' } });
    await latch.queued(1);
    const pay = call(`/payments/${bill.id}/simulate`, { token: ownerToken, method: 'POST' });
    await latch.queued(2);
    await latch.release();
    const [waived, paid] = await Promise.all([waive, pay]);

    expect(waived.status).toBe(200);
    expect(paid.status).toBe(200);
    // Never paid and waived together: the money is owed back instead.
    expect(await ownerBill(bill.id)).toMatchObject({ status: 'void', paymentMode: 'waived', razorpayPaymentId: null });
    expect(paid.body.refund).toMatchObject({ reason: 'bill_waived', status: 'refund_due' });
    expect((await exceptions()).map((e) => e.reason)).toEqual(['bill_waived']);
  });
});

describe('paused hostels in the admin view (edge case M10)', () => {
  test('15 days past due is not paused; 16 is; paying on day 16 restores it at once', async () => {
    const { hostel, bill } = await proHostelWithBill('Day Sixteen PG');
    const pausedList = async () => (await call('/admin/owner-plans?suspended=true', { token: adminToken })).body as { hostelId: string }[];

    setClock('2026-12-24T06:00:00Z'); // due 9 Dec + 15 days
    await runJobs();
    expect(await pausedList()).toHaveLength(0);
    expect((await call('/admin/stats', { token: adminToken })).body.suspendedHostels).toBe(0);
    expect((await call(`/owner/hostels/${hostel.id}/rent`, { token: ownerToken })).status).toBe(200);

    setClock('2026-12-25T06:00:00Z'); // day 16
    await runJobs();
    expect((await pausedList()).map((p) => p.hostelId)).toEqual([hostel.id]);
    expect((await call('/admin/stats', { token: adminToken })).body.suspendedHostels).toBe(1);
    const owner = await call(`/owner/hostels/${hostel.id}/rent`, { token: ownerToken });
    expect(owner.status).toBe(402);
    expect(owner.body.message).toContain('paused');

    // Paid on day 16: no job run needed to lift the pause.
    expect((await call(`/payments/${bill.id}/simulate`, { token: ownerToken, method: 'POST' })).body.status).toBe('paid');
    expect(await pausedList()).toHaveLength(0);
    expect((await call('/admin/stats', { token: adminToken })).body.suspendedHostels).toBe(0);
    expect((await call(`/owner/hostels/${hostel.id}/rent`, { token: ownerToken })).status).toBe(200);
  });
});
