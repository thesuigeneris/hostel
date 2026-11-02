import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getDb } from '../src/db';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, addListingPhoto, admin, liveHostel, newOwner, newTenant, nextPhone } from './fixtures';
import { call, login, resetDb } from './helpers';

// Owner persona: the roster (T8, T10), the visit inbox (S4), listing photos (O4) and the kitchen headcount (O5).

let ownerToken: string;
let adminToken: string;

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
});

afterEach(() => setClock(null));

/** A live Free listing moved to Pro (in its free month), so the roster is open. */
async function proHostel() {
  const h = await liveHostel(ownerToken, adminToken);
  expect((await call(`/owner/hostels/${h.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } })).status).toBe(200);
  return h.hostel as { id: string; slug: string };
}

describe('roster', () => {
  test('two "add resident" taps at once make one invite; the other is told the phone is on the roster (T8)', async () => {
    const h = await proHostel();
    for (let round = 0; round < 3; round++) {
      const phone = nextPhone();
      const body = { phone, name: 'Ravi', monthlyRent: 8000, startDate: '2026-11-01' };
      const results = await Promise.all([0, 1, 2].map(() => call(`/owner/hostels/${h.id}/residents`, { token: ownerToken, body })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      for (const r of results.filter((x) => x.status !== 201)) {
        expect(r.status).toBe(409);
        expect(r.body.message).toBe('This phone is already on your roster');
      }
      const roster = (await call(`/owner/hostels/${h.id}/residents`, { token: ownerToken })).body as { phone: string }[];
      expect(roster.filter((r) => r.phone === phone)).toHaveLength(1);
    }
  });

  test('a move-out date ahead keeps the stay (and its access) until that day; today ends it; before the start is refused (T10)', async () => {
    const h = await proHostel();
    const phone = nextPhone();
    await call(`/owner/hostels/${h.id}/residents`, { token: ownerToken, body: { phone, name: 'Ravi Teja', monthlyRent: 8000, startDate: '2026-11-01' } });
    const resident = await login(phone);
    const stay = (await call('/me/residencies', { token: resident })).body[0];
    expect((await call(`/me/residencies/${stay.id}/accept`, { token: resident, method: 'POST' })).status).toBe(200);
    const end = (endDate: string) => call(`/owner/hostels/${h.id}/residents/${stay.id}/end`, { token: ownerToken, body: { endDate } });

    const before = await end('2026-10-31');
    expect(before.status).toBe(400);
    expect(before.body.message).toContain('before they moved in');

    // Tomorrow: still living here, with the date shown, and still able to use the hostel's pages.
    const tomorrow = await end('2026-11-10');
    expect(tomorrow.status).toBe(200);
    expect(tomorrow.body).toMatchObject({ status: 'active', endDate: '2026-11-10' });
    expect((await call(`/owner/hostels/${h.id}/residents`, { token: ownerToken })).body[0]).toMatchObject({ status: 'active', endDate: '2026-11-10' });
    expect((await call(`/hostels/${h.id}/issues`, { token: resident })).status).toBe(200);
    expect((await runJobs()).endedStays).toBe(0);

    // On the day, the job ends the stay and access with it.
    setClock('2026-11-10T00:30:00Z');
    expect((await runJobs()).endedStays).toBe(1);
    expect((await runJobs()).endedStays).toBe(0);
    expect((await call(`/hostels/${h.id}/issues`, { token: resident })).body.error).toBe('not_a_resident');
    const past = (await call('/me/residencies', { token: resident })).body[0];
    expect(past).toMatchObject({ status: 'ended', endDate: '2026-11-10' });

    // Ending it again changes nothing.
    expect((await end('2026-11-12')).body).toMatchObject({ status: 'ended', endDate: '2026-11-10' });
  });

  test('a move-out dated today ends the stay at once, and an unanswered invite is withdrawn', async () => {
    const h = await proHostel();
    const phone = nextPhone();
    await call(`/owner/hostels/${h.id}/residents`, { token: ownerToken, body: { phone, name: 'Asha', monthlyRent: 8000, startDate: '2026-11-01' } });
    const resident = await login(phone);
    const stay = (await call('/me/residencies', { token: resident })).body[0];
    await call(`/me/residencies/${stay.id}/accept`, { token: resident, method: 'POST' });
    const today = await call(`/owner/hostels/${h.id}/residents/${stay.id}/end`, { token: ownerToken, body: { endDate: '2026-11-09' } });
    expect(today.body).toMatchObject({ status: 'ended', endDate: '2026-11-09' });

    const invite = await call(`/owner/hostels/${h.id}/residents`, { token: ownerToken, body: { phone: nextPhone(), monthlyRent: 7000, startDate: '2026-11-09' } });
    const withdrawn = await call(`/owner/hostels/${h.id}/residents/${invite.body.id}/end`, { token: ownerToken, body: { endDate: '2026-11-20' } });
    expect(withdrawn.body).toMatchObject({ status: 'declined', endDate: null });
  });
});

describe('visit inbox (S4)', () => {
  async function visit() {
    const { hostel } = await liveHostel(ownerToken, adminToken);
    const seeker = await newTenant('Seeker');
    const v = await call(`/hostels/${hostel.id}/visits`, { token: seeker.token, body: { preferredDate: '2026-11-12' } });
    expect(v.status).toBe(201);
    return { seeker, id: v.body.id as string };
  }
  const setStatus = (id: string, status: string, token = ownerToken) => call(`/owner/visits/${id}`, { token, method: 'PATCH', body: { status } });

  test('new → contacted → closed; closed is final; the same status twice changes nothing', async () => {
    const { id } = await visit();
    expect((await setStatus(id, 'contacted')).body.status).toBe('contacted');
    expect((await setStatus(id, 'contacted')).status).toBe(200);
    const back = await setStatus(id, 'new');
    expect(back.status).toBe(409);
    expect((await setStatus(id, 'closed')).body.status).toBe('closed');
    const reopen = await setStatus(id, 'contacted');
    expect(reopen.status).toBe(409);
    expect(reopen.body.message).toContain('can’t be reopened');
    expect((await setStatus(id, 'new')).status).toBe(409);
    // Another owner can't touch it at all.
    expect((await setStatus(id, 'closed', await newOwner())).status).toBe(404);
  });

  test("a request the seeker withdrew can't be moved back to contacted", async () => {
    const { seeker, id } = await visit();
    expect((await call(`/me/visits/${id}`, { token: seeker.token, method: 'DELETE' })).body.status).toBe('closed');
    expect((await setStatus(id, 'contacted')).status).toBe(409);
    const mine = (await call('/me/visits', { token: seeker.token })).body[0];
    expect(mine.status).toBe('closed');
  });

  test('a withdrawal racing "mark contacted" ends in one consistent state', async () => {
    for (let round = 0; round < 3; round++) {
      const { seeker, id } = await visit();
      const [owner, withdraw] = await Promise.all([setStatus(id, 'contacted'), call(`/me/visits/${id}`, { token: seeker.token, method: 'DELETE' })]);
      const final = (await call('/me/visits', { token: seeker.token })).body.find((v: { id: string }) => v.id === id).status;
      if (withdraw.status === 200) {
        expect(final).toBe('closed');
        expect(owner.status).toBe(409);
      } else {
        expect(final).toBe('contacted');
        expect(owner.status).toBe(200);
      }
    }
  });
});

describe('listing photos (O4)', () => {
  test('a live listing keeps at least one photo; two removals at once leave one', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken);
    const photos = (await call(`/owner/hostels/${hostel.id}`, { token: ownerToken })).body.photos as { id: string }[];
    expect(photos).toHaveLength(1);
    const last = await call(`/owner/hostels/${hostel.id}/photos/${photos[0]!.id}`, { token: ownerToken, method: 'DELETE' });
    expect(last.status).toBe(409);
    expect(last.body.message).toBe('Your listing is live, so it needs at least one photo. Upload another photo first, then remove this one.');

    const second = await addListingPhoto(ownerToken, hostel.id);
    const both = await Promise.all(
      [photos[0]!.id, second.id].map((pid) => call(`/owner/hostels/${hostel.id}/photos/${pid}`, { token: ownerToken, method: 'DELETE' })),
    );
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await call(`/owner/hostels/${hostel.id}`, { token: ownerToken })).body.photos).toHaveLength(1);
  });

  test('a draft can remove its only photo; another owner gets 404', async () => {
    const draft = await call('/owner/hostels', {
      token: ownerToken,
      body: { name: 'Draft House', area: 'Madhapur', lat: 17.44, lng: 78.38, genderType: 'boys', contactPhone: '9876500001' },
    });
    const photo = await addListingPhoto(ownerToken, draft.body.id);
    expect((await call(`/owner/hostels/${draft.body.id}/photos/${photo.id}`, { token: await newOwner(), method: 'DELETE' })).status).toBe(404);
    expect((await call(`/owner/hostels/${draft.body.id}/photos/${photo.id}`, { token: ownerToken, method: 'DELETE' })).status).toBe(200);
  });
});

describe('kitchen headcount (O5)', () => {
  /** Captures the SQL and parameters the API sends while `fn` runs. */
  async function queriesDuring(fn: () => Promise<unknown>) {
    const session = (getDb() as unknown as { _: { session: { logger: { logQuery: (q: string, p: unknown[]) => void } } } })._.session;
    const saved = session.logger;
    const seen: { sql: string; params: unknown[] }[] = [];
    session.logger = { logQuery: (sql, params) => seen.push({ sql, params }) };
    try {
      await fn();
    } finally {
      session.logger = saved;
    }
    return seen;
  }

  test('counts subscribers eating at this hostel on the date, moves included, filtered by hostel in SQL', async () => {
    const a = await liveHostel(ownerToken, adminToken, { partner: true });
    const b = await liveHostel(ownerToken, adminToken, { partner: true, foodAvailable: true });
    const elsewhere = await liveHostel(await newOwner(), adminToken, { partner: true });
    const mover = await newTenant('Mover');
    await activeSubscriber(mover.token, a.hostel.id, a.rooms[0].id, 'full', 'veg');
    const stayer = await newTenant('Stayer');
    await activeSubscriber(stayer.token, a.hostel.id, a.rooms[0].id, 'two-meals', 'non-veg');
    const other = await newTenant('Other');
    await activeSubscriber(other.token, elsewhere.hostel.id, elsewhere.rooms[0].id, 'full', 'veg');
    const move = await call('/me/moves', { token: mover.token, body: { toRoomTypeId: b.rooms[0].id, moveDate: '2026-11-12' } });
    expect(move.status).toBe(201);

    const count = async (hostelId: string, date: string) =>
      Object.fromEntries(
        ((await call(`/owner/hostels/${hostelId}/headcount?date=${date}`, { token: ownerToken })).body.meals as { meal: string; total: number; veg: number; nonVeg: number }[]).map(
          (m) => [m.meal, `${m.total}:${m.veg}/${m.nonVeg}`],
        ),
      );
    // Before the move both eat at A; from the move date the mover eats at B. The other hostel's subscriber never counts.
    expect(await count(a.hostel.id, '2026-11-11')).toEqual({ breakfast: '2:1/1', lunch: '1:1/0', dinner: '2:1/1' });
    expect(await count(b.hostel.id, '2026-11-11')).toEqual({ breakfast: '0:0/0', lunch: '0:0/0', dinner: '0:0/0' });
    expect(await count(a.hostel.id, '2026-11-12')).toEqual({ breakfast: '1:0/1', lunch: '0:0/0', dinner: '1:0/1' });
    expect(await count(b.hostel.id, '2026-11-12')).toEqual({ breakfast: '1:1/0', lunch: '1:1/0', dinner: '1:1/0' });

    // Only this hostel's subscriptions are read: the subscription query is bound to the hostel, not every active plan.
    const seen = await queriesDuring(() => call(`/owner/hostels/${a.hostel.id}/headcount?date=2026-11-12`, { token: ownerToken }));
    const subscriptionReads = seen.filter((q) => /from "subscriptions"/.test(q.sql));
    expect(subscriptionReads.length).toBeGreaterThan(0);
    for (const q of subscriptionReads) expect(q.params).toContain(a.hostel.id);
    expect(seen.some((q) => /from "move_requests"/.test(q.sql) && !q.params.includes(a.hostel.id))).toBe(false);
  });
});
