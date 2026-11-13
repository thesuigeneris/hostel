import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { admin, liveHostel, liveSubscriber, newOwner, newTenant, payByCheckout, withRazorpay } from './fixtures';
import { call, resetDb } from './helpers';

/**
 * A move is cancelled after the next month's bill was already paid at the new room's rent. The bill goes back to the
 * hostel the resident stays in (it is paid out there), its rent is cut to the room they stay in, and anything paid
 * above that is owed back. A cheaper move never turns into an extra charge.
 */

let ownerToken: string;
let adminToken: string;
let origin: { hostel: { id: string }; rooms: { id: string }[] };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  origin = await liveHostel(ownerToken, adminToken, {
    partner: true,
    rooms: [{ sharing: '2-sharing', monthlyRent: 10000, totalBeds: 10, bedsAvailable: 5 }],
  });
});

afterEach(() => setClock(null));

/** Subscribes at the origin (food: none), schedules a move for the next period, and pays that period's bill at the new rent. */
async function paidMove(destRent: number) {
  const dest = await liveHostel(ownerToken, adminToken, {
    partner: true,
    area: 'Madhapur',
    rooms: [{ sharing: 'private', monthlyRent: destRent, totalBeds: 3, bedsAvailable: 2 }],
  });
  const t = await newTenant();
  await liveSubscriber(t.token, origin.hostel.id, origin.rooms[0]!.id, 'none');
  setClock('2026-12-05T06:00:00Z');
  await runJobs(); // the December bill, at the origin
  const move = await call('/me/moves', { token: t.token, body: { toRoomTypeId: dest.rooms[0]!.id, moveDate: '2026-12-09' } });
  expect(move.status).toBe(201);
  const bill = (await call('/me/invoices', { token: t.token })).body.find((b: { status: string }) => b.status === 'due');
  expect(bill).toMatchObject({ periodStart: '2026-12-09', rentAmount: destRent, hostelId: dest.hostel.id });
  await withRazorpay('live', () => payByCheckout(t.token, bill.id));
  return { t, dest, move: move.body as { id: string }, billId: bill.id as string };
}

const delist = (hostelId: string) => getDb().update(schema.hostels).set({ status: 'draft' }).where(eq(schema.hostels.id, hostelId));
const invoice = async (id: string) => (await getDb().select().from(schema.invoices).where(eq(schema.invoices.id, id)))[0]!;
const refunds = async () => (await call('/admin/payment-exceptions', { token: adminToken })).body as Record<string, unknown>[];

describe('a move cancelled after its first bill was paid', () => {
  test('the destination closed: the bill goes back to the origin and the extra rent is owed back, once', async () => {
    const { t, dest, billId } = await paidMove(15000);
    await delist(dest.hostel.id);
    setClock('2026-12-09T06:00:00Z');
    expect((await runJobs()).cancelledMoves).toBe(1);

    expect(await invoice(billId)).toMatchObject({ status: 'paid', hostelId: origin.hostel.id, rentAmount: 10000, totalAmount: 10000, paymentMode: 'razorpay_live' });
    const owed = await refunds();
    expect(owed).toHaveLength(1);
    expect(owed[0]).toMatchObject({ billId, amount: 5000, reason: 'move_cancelled', status: 'refund_due', paymentMode: 'razorpay_live' });
    const page = (await call(`/payments/${billId}`, { token: t.token })).body;
    expect(page.refund).toMatchObject({ amount: 5000, reason: 'move_cancelled' });

    // The job running again changes nothing.
    expect((await runJobs()).cancelledMoves).toBe(0);
    expect(await refunds()).toHaveLength(1);
    expect((await invoice(billId)).totalAmount).toBe(10000);

    // December's payout: the origin is paid for the rent of the room the resident stayed in; the destination nothing.
    setClock('2027-01-02T06:00:00Z');
    const payouts = (await call('/admin/payouts/generate', { token: adminToken, body: { month: '2026-12' } })).body as { hostelId: string; grossAmount: number }[];
    expect(payouts.find((p) => p.hostelId === dest.hostel.id)).toBeUndefined();
    expect(payouts.find((p) => p.hostelId === origin.hostel.id)).toMatchObject({ grossAmount: 10000 });
  });

  test('a cheaper destination: the bill goes back to the origin and is never charged extra', async () => {
    const { dest, billId } = await paidMove(8000);
    await delist(dest.hostel.id);
    setClock('2026-12-09T06:00:00Z');
    expect((await runJobs()).cancelledMoves).toBe(1);
    expect(await invoice(billId)).toMatchObject({ status: 'paid', hostelId: origin.hostel.id, rentAmount: 8000, totalAmount: 8000 });
    expect(await refunds()).toEqual([]);
    const bills = (await getDb().select().from(schema.invoices).where(eq(schema.invoices.periodStart, '2026-12-09')));
    expect(bills.filter((b) => b.status !== 'void')).toHaveLength(1);
  });

  test('the resident cancels the move themselves: the same settlement', async () => {
    const { t, dest, move, billId } = await paidMove(15000);
    const cancelled = await call(`/me/moves/${move.id}`, { token: t.token, method: 'DELETE' });
    expect(cancelled.body.status).toBe('cancelled');
    expect(await invoice(billId)).toMatchObject({ hostelId: origin.hostel.id, rentAmount: 10000, totalAmount: 10000 });
    expect(await refunds()).toMatchObject([{ billId, amount: 5000, reason: 'move_cancelled' }]);
    expect((await call(`/me/moves/${move.id}`, { token: t.token, method: 'DELETE' })).body.error).toBe('move_not_allowed');
    expect(await refunds()).toHaveLength(1);
    expect(dest.hostel.id).not.toBe(origin.hostel.id);
  });
});

describe('a move after the next month was paid early at the current room', () => {
  test('a move date on or before that month is refused, saying when it can be; after it, the move is scheduled', async () => {
    const dest = await liveHostel(ownerToken, adminToken, {
      partner: true,
      area: 'Madhapur',
      rooms: [{ sharing: 'private', monthlyRent: 15000, totalBeds: 3, bedsAvailable: 2 }],
    });
    const t = await newTenant();
    await liveSubscriber(t.token, origin.hostel.id, origin.rooms[0]!.id, 'none');
    setClock('2026-12-05T06:00:00Z');
    await runJobs(); // the bill from 9 December, at the current room
    const next = (await call('/me/invoices', { token: t.token })).body.find((b: { status: string }) => b.status === 'due');
    await withRazorpay('live', () => payByCheckout(t.token, next.id));

    for (const moveDate of ['2026-12-09', '2026-12-06']) {
      const refused = await call('/me/moves', { token: t.token, body: { toRoomTypeId: dest.rooms[0]!.id, moveDate } });
      expect(refused.body).toMatchObject({ error: 'move_not_allowed', message: "You've already paid for 9 Dec 2026 to 8 Jan 2027 here. Pick a move date after 8 Jan 2027." });
    }
    // Inside the paid month itself the move is fine: that month stays with this hostel, the next bill is the new room's.
    expect((await call('/me/moves', { token: t.token, body: { toRoomTypeId: dest.rooms[0]!.id, moveDate: '2026-12-20' } })).status).toBe(201);
    const bills = (await call('/me/invoices', { token: t.token })).body as { periodStart: string; status: string; hostelId: string }[];
    expect(bills.find((b) => b.periodStart === '2026-12-09')).toMatchObject({ status: 'paid', hostelId: origin.hostel.id });
  });
});
