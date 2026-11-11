import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { addDays, billingPeriod, istInstant } from '@hostels/shared';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, nextPhone, roomBeds } from './fixtures';
import { call, login, resetDb } from './helpers';

/**
 * Daily-life rows from docs/product/edge-cases.md: I9 (the board when the plan lapses), I10 (post lengths),
 * M4 (skips no bill will carry), M5 (month-end starts), M6 (skip cut-offs to the minute), M7 (the credit cap),
 * M13 (a move into a hostel that stopped taking residents).
 */

let ownerToken: string;
let adminToken: string;
let hostel: { id: string; slug: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z'); // Monday, 11:30 IST
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

async function subscriber(plan = 'full') {
  const t = await newTenant('Asha Rao');
  await activeSubscriber(t.token, hostel.id, room.id, plan);
  return t.token;
}

const skip = (token: string, date: string, meal: string) => call('/me/skips', { token, body: { date, meal } });
const unskip = (token: string, date: string, meal: string) => call(`/me/skips/${date}/${meal}`, { token, method: 'DELETE' });

describe('I9: the board when the hostel drops to Free or is paused', () => {
  test('residents are told it is paused, nothing is lost, and it comes back when the bill is paid', async () => {
    const pro = await liveHostel(ownerToken, adminToken);
    await call(`/owner/hostels/${pro.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });
    const phone = nextPhone();
    await call(`/owner/hostels/${pro.hostel.id}/residents`, { token: ownerToken, body: { phone, name: 'Ravi', monthlyRent: 7000, startDate: '2026-11-09' } });
    const ravi = await login(phone);
    const stay = (await call('/me/residencies', { token: ravi })).body[0];
    await call(`/me/residencies/${stay.id}/accept`, { token: ravi, method: 'POST' });
    const post = await call(`/hostels/${pro.hostel.id}/community`, { token: ravi, body: { kind: 'event', body: 'Cricket on Saturday?' } });
    expect(post.status).toBe(201);

    // The trial ends, the plan bill goes unpaid for more than 15 days, and the hostel drops to Free features.
    setClock('2026-12-04T06:00:00Z');
    await runJobs();
    setClock('2026-12-25T06:00:00Z');
    await runJobs();
    const feed = await call(`/hostels/${pro.hostel.id}/community`, { token: ravi });
    expect(feed.status).toBe(402);
    expect(feed.body.message).toContain('paused');
    expect(feed.body.message).toContain('Nothing has been deleted');
    expect(feed.body.message).not.toContain('bill');
    expect((await call(`/hostels/${pro.hostel.id}/community`, { token: ravi, body: { kind: 'general', body: 'Anyone?' } })).status).toBe(402);
    expect((await call(`/posts/${post.body.id}/comments`, { token: ravi, body: { body: 'Me!' } })).status).toBe(402);
    // Issues still work: the hostel's record doesn't depend on its plan.
    expect((await call(`/hostels/${pro.hostel.id}/issues`, { token: ravi, body: { category: 'wifi', title: 'WiFi is down' } })).status).toBe(201);

    const bill = (await call(`/owner/hostels/${pro.hostel.id}/plan`, { token: ownerToken })).body.bills[0];
    await call(`/payments/${bill.id}/simulate`, { token: ownerToken, method: 'POST' });
    const back = await call(`/hostels/${pro.hostel.id}/community`, { token: ravi });
    expect(back.status).toBe(200);
    expect(back.body.map((p: { body: string }) => p.body)).toEqual(['Cricket on Saturday?']);
  });

  test('a board the hostel never turned on says so', async () => {
    const pro = await liveHostel(ownerToken, adminToken);
    await call(`/owner/hostels/${pro.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });
    const phone = nextPhone();
    await call(`/owner/hostels/${pro.hostel.id}/residents`, { token: ownerToken, body: { phone, name: 'Ravi', monthlyRent: 7000, startDate: '2026-11-09' } });
    const ravi = await login(phone);
    const stay = (await call('/me/residencies', { token: ravi })).body[0];
    await call(`/me/residencies/${stay.id}/accept`, { token: ravi, method: 'POST' });
    // The owner goes back to Free during the trial, before anyone posted.
    await call(`/owner/hostels/${pro.hostel.id}/plan`, { token: ownerToken, body: { plan: 'free' } });
    const feed = await call(`/hostels/${pro.hostel.id}/community`, { token: ravi });
    expect(feed.status).toBe(402);
    expect(feed.body.message).toBe("Your hostel hasn't turned on the community board yet. You can still report issues.");
  });
});

describe('I10: post and reply lengths', () => {
  test('1,000 characters is accepted and 1,001 refused, counting an emoji or a Devanagari letter as one', async () => {
    const t = await subscriber();
    const post = (body: string) => call(`/hostels/${hostel.id}/community`, { token: t, body: { kind: 'general', body } });
    expect((await post('a'.repeat(1000))).status).toBe(201);
    const over = await post('a'.repeat(1001));
    expect(over.status).toBe(400);
    expect(over.body.issues[0].message).toBe('Keep the post to 1,000 characters (it has 1,001)');
    // 1,000 emoji are 2,000 UTF-16 units; people count 1,000 characters.
    expect((await post('🙂'.repeat(1000))).status).toBe(201);
    expect((await post('🙂'.repeat(1001))).status).toBe(400);
    expect((await post('न'.repeat(1000))).status).toBe(201);
    expect((await post(`  ${'नमस्ते 🙂 '.repeat(100).trim()}  `)).status).toBe(201);
    for (const blank of ['   ', '\n\t ', '\u200B\u200B']) {
      const res = await post(blank);
      expect(res.status).toBe(400);
      expect(res.body.issues[0].message).toBe('Write the post first');
    }

    const target = (await post('Lost keys near the gate')).body.id;
    const reply = (body: string) => call(`/posts/${target}/comments`, { token: t, body: { body } });
    expect((await reply('🙂'.repeat(500))).status).toBe(201);
    expect((await reply('x'.repeat(501))).status).toBe(400);
    expect((await reply(' ')).status).toBe(400);
  });
});

describe('M4: skips no bill will ever carry', () => {
  test('after cancelling, a skip still reaches the kitchen but earns nothing, and the menu says why', async () => {
    const t = await subscriber();
    const other = await subscriber();
    setClock('2026-11-20T06:00:00Z');
    const cancelled = await call('/me/subscription/cancel', { token: t, method: 'POST' });
    expect(cancelled.body.cancelAt).toBe('2026-12-08');

    const free = await skip(t, '2026-11-25', 'dinner');
    expect(free.status).toBe(201);
    expect(free.body.creditAmount).toBe(0);
    expect((await skip(other, '2026-11-25', 'dinner')).body.creditAmount).toBe(80);
    const head = (await call(`/owner/hostels/${hostel.id}/headcount?date=2026-11-25`, { token: ownerToken })).body;
    expect(head.meals.find((m: { meal: string }) => m.meal === 'dinner')).toMatchObject({ skipped: 2, total: 0 });

    const menu = (await call('/me/menu?days=3', { token: t })).body;
    expect(menu.noCreditFrom).toBe('2026-11-09');
    expect(menu.days[0].meals.map((m: { credit: number }) => m.credit)).toEqual([0, 0, 0]);
    expect((await call('/me/menu?days=1', { token: other })).body).toMatchObject({ noCreditFrom: null, days: [{ meals: [{ credit: 50 }, { credit: 80 }, { credit: 80 }] }] });

    // No bill is generated after the plan ends, so nothing could have carried the credit.
    setClock('2026-12-04T06:00:00Z');
    await runJobs();
    expect((await call('/me/invoices', { token: t })).body).toHaveLength(1);
  });

  test('a plan paid ahead and then cancelled: skips before the last bill was made earn credit, later ones do not', async () => {
    const t = await subscriber();
    await skip(t, '2026-11-20', 'lunch');
    setClock('2026-12-04T06:00:00Z');
    await runJobs();
    const next = (await call('/me/invoices', { token: t })).body.find((i: { periodStart: string }) => i.periodStart === '2026-12-09');
    expect(next.creditAmount).toBe(80);
    await call(`/payments/${next.id}/simulate`, { token: t, method: 'POST' });
    setClock('2026-12-05T06:00:00Z');
    expect((await call('/me/subscription/cancel', { token: t, method: 'POST' })).body.cancelAt).toBe('2027-01-08');
    const menu = (await call('/me/menu?days=2', { token: t })).body;
    // The last bill (9 December) was made on 4 December and carries skips up to 3 December.
    expect(menu.noCreditFrom).toBe('2026-12-04');
    expect((await skip(t, '2026-12-06', 'dinner')).body.creditAmount).toBe(0);
  });
});

describe('M5: plans starting on the 29th, 30th or 31st', () => {
  test('each bill covers the period right after the last, and appears 5 days before it', async () => {
    for (const start of ['2027-01-29', '2027-01-30', '2027-01-31', '2028-01-31']) {
      await resetDb();
      setClock(istInstant(start, 11));
      ownerToken = await newOwner();
      adminToken = await admin();
      const h = await liveHostel(ownerToken, adminToken, { partner: true });
      const t = await newTenant();
      await activeSubscriber(t.token, h.hostel.id, h.rooms[0].id, 'full');
      const periods = [];
      for (let n = 1; n <= 3; n++) {
        const p = billingPeriod(start, n);
        setClock(istInstant(addDays(p.start, -6), 11));
        await runJobs();
        expect((await call('/me/invoices', { token: t.token })).body.some((i: { periodStart: string }) => i.periodStart === p.start)).toBe(false);
        setClock(istInstant(addDays(p.start, -5), 11));
        await runJobs();
        const bill = (await call('/me/invoices', { token: t.token })).body.find((i: { periodStart: string }) => i.periodStart === p.start);
        expect(bill).toMatchObject({ periodEnd: p.end, dueDate: p.start });
        periods.push([bill.periodStart, bill.periodEnd]);
      }
      const first = billingPeriod(start, 0);
      const all = [[first.start, first.end], ...periods];
      for (let k = 1; k < all.length; k++) expect(all[k]![0]).toBe(addDays(all[k - 1]![1]!, 1));
      if (start === '2027-01-31') expect(all.slice(0, 3)).toEqual([['2027-01-31', '2027-02-27'], ['2027-02-28', '2027-03-30'], ['2027-03-31', '2027-04-29']]);
      if (start === '2028-01-31') expect(all[1]).toEqual(['2028-02-29', '2028-03-30']);
    }
  });
});

describe('M6: skip cut-offs to the minute, with the server clock in UTC', () => {
  test('a minute before the cut-off is fine; exactly at it is too late', async () => {
    const t = await subscriber();
    const cases = [
      ['breakfast', '2026-11-10T16:29:00Z', '2026-11-10T16:30:00Z', '2026-11-11'], // 21:59 / 22:00 IST the night before
      ['lunch', '2026-11-11T03:29:00Z', '2026-11-11T03:30:00Z', '2026-11-11'], // 08:59 / 09:00 IST
      ['dinner', '2026-11-11T09:29:00Z', '2026-11-11T09:30:00Z', '2026-11-11'], // 14:59 / 15:00 IST
    ] as const;
    for (const [meal, before, at, date] of cases) {
      setClock(before);
      expect((await skip(t, date, meal)).status).toBe(201);
      expect((await unskip(t, date, meal)).status).toBe(200);
      expect((await skip(t, date, meal)).status).toBe(201);
      const open = (await call('/me/menu?days=2', { token: t })).body.days.find((d: { date: string }) => d.date === date).meals.find((m: { meal: string }) => m.meal === meal);
      expect(open).toMatchObject({ canChange: true, skipped: true, cutoff: new Date(at).toISOString() });
      setClock(at);
      expect((await unskip(t, date, meal)).body.error).toBe('cutoff_passed');
      expect((await skip(t, date, meal === 'breakfast' ? 'lunch' : meal)).status).toBe(meal === 'breakfast' ? 201 : 409);
      const locked = (await call('/me/menu?days=2', { token: t })).body.days.find((d: { date: string }) => d.date === date).meals.find((m: { meal: string }) => m.meal === meal);
      expect(locked).toMatchObject({ canChange: false, skipped: true });
    }
  });
});

describe('M7: skip credits are capped at the food price', () => {
  test('a month of skipped meals takes off the food price, never more', async () => {
    const t = await subscriber('full');
    // Skip every meal in the window the 9 January bill carries (4 December to 3 January): 31 days × ₹210 = ₹6,510.
    setClock('2026-12-03T06:00:00Z');
    for (let d = 0; d < 31; d++) {
      for (const meal of ['breakfast', 'lunch', 'dinner']) expect((await skip(t, addDays('2026-12-04', d), meal)).status).toBe(201);
    }
    setClock('2027-01-04T06:00:00Z');
    await runJobs();
    const jan = (await call('/me/invoices', { token: t })).body.find((i: { periodStart: string }) => i.periodStart === '2027-01-09');
    expect(jan).toMatchObject({ foodAmount: 6000, creditAmount: 6000, totalAmount: 10000 });
  });
});

describe('M13: a move into a hostel that stopped taking residents', () => {
  const blockers = [
    ['is no longer a verified partner', { partnerStatus: 'none' as const }],
    ['is no longer listed on Hostels', { status: 'rejected' as const }],
    ["isn't taking new residents right now", 'suspend'],
  ] as const;

  for (const [reason, change] of blockers) {
    test(`is cancelled on its day when the hostel ${reason}; the bed and bills go back`, async () => {
      const dest = await liveHostel(ownerToken, adminToken, {
        partner: true,
        name: 'Lotus Residency',
        rooms: [{ sharing: 'private', monthlyRent: 15000, totalBeds: 3, bedsAvailable: 2 }],
      });
      const t = await subscriber();
      setClock('2026-12-05T06:00:00Z');
      await runJobs();
      expect((await call('/me/moves', { token: t, body: { toRoomTypeId: dest.rooms[0].id, moveDate: '2026-12-08' } })).status).toBe(201);
      expect(await roomBeds(ownerToken, dest.hostel.id, dest.rooms[0].id)).toBe(1);
      expect((await call('/me/invoices', { token: t })).body[0]).toMatchObject({ periodStart: '2026-12-09', rentAmount: 15000, hostelId: dest.hostel.id });
      const before = (await call('/me/subscription', { token: t })).body;
      expect(before.scheduledMove).toMatchObject({ toHostelName: 'Lotus Residency', toSharing: 'private', toHostelOpen: true });

      const db = getDb();
      if (change === 'suspend') await db.update(schema.ownerPlans).set({ suspended: true }).where(eq(schema.ownerPlans.hostelId, dest.hostel.id));
      else await db.update(schema.hostels).set(change).where(eq(schema.hostels.id, dest.hostel.id));
      expect((await call('/me/subscription', { token: t })).body.scheduledMove.toHostelOpen).toBe(false);

      setClock('2026-12-08T06:00:00Z');
      const jobs = await runJobs();
      expect(jobs).toMatchObject({ completedMoves: 0, cancelledMoves: 1 });
      expect((await runJobs()).cancelledMoves).toBe(0);

      const me = (await call('/me/subscription', { token: t })).body;
      expect(me.subscription).toMatchObject({ hostelId: hostel.id, roomTypeId: room.id });
      expect(me.scheduledMove).toBeNull();
      expect(me.cancelledMove).toMatchObject({ status: 'cancelled', toHostelName: 'Lotus Residency', cancelReason: `Lotus Residency ${reason}` });
      expect(await roomBeds(ownerToken, dest.hostel.id, dest.rooms[0].id)).toBe(2);
      const bill = (await call('/me/invoices', { token: t })).body.find((i: { periodStart: string }) => i.periodStart === '2026-12-09');
      expect(bill).toMatchObject({ rentAmount: 10000, hostelId: hostel.id, status: 'due' });
      const stays = (await call('/me/residencies', { token: t })).body;
      expect(stays.map((s: { status: string; hostel: { id: string } }) => [s.status, s.hostel.id])).toEqual([['active', hostel.id]]);
    });
  }

  test('a move into a hostel still taking residents completes as before', async () => {
    const dest = await liveHostel(ownerToken, adminToken, { partner: true, rooms: [{ sharing: 'private', monthlyRent: 15000, totalBeds: 3, bedsAvailable: 2 }] });
    const t = await subscriber();
    setClock('2026-12-05T06:00:00Z');
    await call('/me/moves', { token: t, body: { toRoomTypeId: dest.rooms[0].id, moveDate: '2026-12-08' } });
    setClock('2026-12-08T06:00:00Z');
    expect(await runJobs()).toMatchObject({ completedMoves: 1, cancelledMoves: 0 });
    expect((await call('/me/subscription', { token: t })).body).toMatchObject({ subscription: { hostelId: dest.hostel.id }, cancelledMove: null });
  });
});
