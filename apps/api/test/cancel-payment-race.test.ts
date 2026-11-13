import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';
import { holdRow } from './latch';

/**
 * Cancelling a pending plan at the moment its first bill is paid (TODO §2): one consistent outcome, never a deadlock
 * (a 500). The plan's row is held so both requests queue up behind it, cancel first, then let go together.
 */

let ownerToken: string;
let adminToken: string;
let hostel: { id: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true });
  hostel = h.hostel;
  room = h.rooms[0]!;
});

afterEach(() => setClock(null));

describe('cancel and pay at the same moment', () => {
  test('cancel queued first: the plan is cancelled and the late payment is refused; nothing fails', async () => {
    const t = await newTenant();
    const sub = (await call(`/hostels/${hostel.id}/subscribe`, { token: t.token, body: { roomTypeId: room.id, mealPlan: 'none' } })).body;
    const latch = await holdRow('subscriptions', sub.subscription.id);
    const cancel = call('/me/subscription/cancel', { token: t.token, method: 'POST' });
    await latch.queued(1);
    const pay = call(`/payments/${sub.invoice.id}/simulate`, { token: t.token, method: 'POST' });
    await latch.queued(2);
    await latch.release();
    const [c, p] = await Promise.all([cancel, pay]);
    expect([c.status, p.status]).not.toContain(500);
    expect(c.body.status).toBe('cancelled');
    const bill = (await call(`/payments/${sub.invoice.id}`, { token: t.token })).body;
    expect(bill.status).toBe('void');
    // The payment came second: it is refused before any money moves (a real Razorpay payment would be recorded as owed
    // back instead, which late-payments.test.ts covers).
    expect(p.body.error).toBe('invalid_state');
    expect(bill.refund ?? null).toBeNull();
  });

  test('payment queued first: the plan is active and the cancel is told to refresh', async () => {
    const t = await newTenant();
    const sub = (await call(`/hostels/${hostel.id}/subscribe`, { token: t.token, body: { roomTypeId: room.id, mealPlan: 'none' } })).body;
    const latch = await holdRow('subscriptions', sub.subscription.id);
    const pay = call(`/payments/${sub.invoice.id}/simulate`, { token: t.token, method: 'POST' });
    await latch.queued(1);
    const cancel = call('/me/subscription/cancel', { token: t.token, method: 'POST' });
    await latch.queued(2);
    await latch.release();
    const [p, c] = await Promise.all([pay, cancel]);
    expect([c.status, p.status]).not.toContain(500);
    expect(p.status).toBe(200);
    expect((await call('/me/subscription', { token: t.token })).body.subscription.status).toBe('active');
  });
});

describe('paying a first bill after the 30-minute hold, before the job releases the bed', () => {
  test('the bed is still held, so the payment confirms the plan; once the job has run, it is owed back instead', async () => {
    const t = await newTenant();
    const sub = (await call(`/hostels/${hostel.id}/subscribe`, { token: t.token, body: { roomTypeId: room.id, mealPlan: 'none' } })).body;
    setClock('2026-11-09T06:31:00Z'); // 31 minutes later; the job has not run
    expect((await call(`/payments/${sub.invoice.id}`, { token: t.token })).body.status).toBe('due');
    expect((await call(`/payments/${sub.invoice.id}/simulate`, { token: t.token, method: 'POST' })).status).toBe(200);
    expect((await call('/me/subscription', { token: t.token })).body.subscription.status).toBe('active');

    // Another tenant whose hold the job has already released: the bill is void and can't be paid by simulation.
    const u = await newTenant();
    setClock('2026-11-09T07:00:00Z');
    const other = (await call(`/hostels/${hostel.id}/subscribe`, { token: u.token, body: { roomTypeId: room.id, mealPlan: 'none' } })).body;
    setClock('2026-11-09T07:31:00Z');
    expect((await call('/admin/jobs/run', { token: adminToken, method: 'POST' })).body.expiredSubscriptions).toBe(1);
    expect((await call(`/payments/${other.invoice.id}`, { token: u.token })).body.status).toBe('void');
    expect((await call(`/payments/${other.invoice.id}/simulate`, { token: u.token, method: 'POST' })).body.error).toBe('invalid_state');
  });
});
