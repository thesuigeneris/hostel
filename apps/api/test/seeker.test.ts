import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { addDays, VISIT_MAX_DAYS_AHEAD } from '@hostels/shared';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

// Seeker journeys: search order and paging, suggestions while typing, and visit requests.

let ownerToken: string;
let adminToken: string;
const TODAY = '2026-11-09';

beforeEach(async () => {
  await resetDb();
  setClock(`${TODAY}T06:00:00Z`);
  ownerToken = await newOwner();
  adminToken = await admin();
});

afterEach(() => setClock(null));

type Page = { items: { id: string; name: string; rating: number | null; reviewCount: number }[]; total: number; page: number };
const search = async (query: string) => (await call(`/hostels?${query}`)).body as Page;
const names = (p: Page) => p.items.map((i) => i.name);

const ROOM = { sharing: '2-sharing', monthlyRent: 9000, totalBeds: 10, bedsAvailable: 10 };

/** Residents who subscribed 15 days ago each leave one review with the given overall rating. */
async function reviewed(hostelName: string, ratings: number[]) {
  const { hostel, rooms } = await liveHostel(ownerToken, adminToken, { name: hostelName, partner: true, foodAvailable: false, rooms: [ROOM] });
  setClock(`${TODAY}T06:00:00Z`);
  const tenants = [];
  for (const _ of ratings) {
    const t = await newTenant('Resident Reviewer');
    await activeSubscriber(t.token, hostel.id, rooms[0].id, 'none');
    tenants.push(t);
  }
  setClock(`${addDays(TODAY, 15)}T06:00:00Z`);
  for (const [i, rating] of ratings.entries()) {
    const body = { rating, cleanliness: rating, safety: rating, responsiveness: rating, body: 'Lived here for a few weeks and this is how it went.' };
    expect((await call(`/hostels/${hostel.id}/review`, { token: tenants[i]!.token, method: 'PUT', body })).status).toBe(200);
  }
  setClock(`${TODAY}T06:00:00Z`);
  return hostel as { id: string; name: string };
}

describe('sort by rating', () => {
  test('a single 5★ review does not outrank many good ones; pages still show the true average', async () => {
    await reviewed('One Review House', [5]);
    await reviewed('Many Reviews House', [5, 5, 5, 5, 5, 4]);
    await reviewed('Poor Reviews House', [2, 2, 2, 2]);

    const page = await search('sort=rating');
    expect(names(page)).toEqual(['Many Reviews House', 'One Review House', 'Poor Reviews House']);
    // The ranking is shrunk; what the cards say is not.
    expect(page.items.find((i) => i.name === 'One Review House')).toMatchObject({ rating: 5, reviewCount: 1 });
    expect(page.items.find((i) => i.name === 'Many Reviews House')).toMatchObject({ rating: 4.8, reviewCount: 6 });

    // "Rated 4★ or higher" only counts ratings a page shows: one review reads "New", not 5.0.
    expect(names(await search('minRating=4'))).toEqual(['Many Reviews House']);
  });
});

describe('paging', () => {
  test('equal rows keep one order in every sort, so paging never repeats or skips a hostel', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const { hostel } = await liveHostel(ownerToken, adminToken, { name: 'Twin Towers PG', lat: 17.44, lng: 78.35, rooms: [ROOM] });
      ids.push(hostel.id);
    }
    const byId = [...ids].sort();
    for (const sort of ['recommended', 'rent_asc', 'rent_desc', 'rating', 'distance']) {
      const near = sort === 'distance' ? '&lat=17.44&lng=78.35' : '';
      expect((await search(`sort=${sort}${near}`)).items.map((i) => i.id)).toEqual(byId);
      const paged: string[] = [];
      for (let p = 1; p <= ids.length; p++) paged.push(...(await search(`sort=${sort}${near}&limit=1&page=${p}`)).items.map((i) => i.id));
      expect(paged).toEqual(byId);
    }
  });

  test('a page past the end still reports the real total', async () => {
    for (const name of ['Alpha', 'Bravo', 'Charlie']) await liveHostel(ownerToken, adminToken, { name, rooms: [ROOM] });
    expect(await search('limit=1&page=9')).toMatchObject({ items: [], total: 3, page: 9 });
    expect(await search('limit=2&page=2')).toMatchObject({ total: 3 });
    expect((await search('limit=2&page=2')).items).toHaveLength(1);
  });
});

describe('search text', () => {
  test('wildcards, quotes and emoji are matched as typed; long text is refused plainly', async () => {
    for (const name of ['Alpha Stay', 'Beta_Home', 'Mom’s Place 🏠', "Raj's PG"]) await liveHostel(ownerToken, adminToken, { name, rooms: [ROOM] });
    expect(await search(`q=${encodeURIComponent('%')}`)).toMatchObject({ total: 0, items: [] });
    expect(names(await search(`q=${encodeURIComponent('_')}`))).toEqual(['Beta_Home']);
    expect(names(await search(`q=${encodeURIComponent('a_h')}`))).toEqual(['Beta_Home']);
    expect(names(await search(`q=${encodeURIComponent('🏠')}`))).toEqual(['Mom’s Place 🏠']);
    expect(names(await search(`q=${encodeURIComponent("raj's")}`))).toEqual(["Raj's PG"]);
    expect(await search(`q=${encodeURIComponent('"; drop table hostels; --')}`)).toMatchObject({ total: 0 });
    expect(await search(`q=${encodeURIComponent('\\')}`)).toMatchObject({ total: 0 });

    const long = await call(`/hostels?q=${'x'.repeat(500)}`);
    expect(long.status).toBe(400);
    expect(long.body.issues[0].message).toBe('Search text can be at most 80 characters');
  });
});

describe('suggestions while typing', () => {
  beforeEach(async () => {
    await liveHostel(ownerToken, adminToken, { name: 'Sunrise Residency', area: 'Madhapur', rooms: [ROOM], partner: true });
    await liveHostel(ownerToken, adminToken, { name: 'Green Nest', area: 'HiTech City', rooms: [ROOM] });
    await liveHostel(ownerToken, adminToken, { name: 'Hitech Homes', area: 'Kondapur', rooms: [ROOM] });
    await liveHostel(ownerToken, adminToken, { name: 'Sunshine PG', area: 'Gachibowli', rooms: [ROOM] });
    // Not live yet, so never suggested.
    await call('/owner/hostels', {
      token: ownerToken,
      body: { name: 'Sunburst Hostel', area: 'Ameerpet', lat: 17.43, lng: 78.44, genderType: 'boys', contactPhone: '9876500009' },
    });
  });

  test('areas first, then hostel names; matches at the start rank first', async () => {
    const hi = await call('/suggest?q=hi');
    expect(hi.status).toBe(200);
    expect(hi.body.items).toEqual([
      { kind: 'area', label: 'HiTech City', slug: 'hitech-city', count: 1 },
      { kind: 'hostel', label: 'Hitech Homes', slug: 'hitech-homes-kondapur', area: 'Kondapur', isVerified: false },
      { kind: 'hostel', label: 'Sunshine PG', slug: 'sunshine-pg-gachibowli', area: 'Gachibowli', isVerified: false },
    ]);
    // Areas match from the start of a word: "hi" inside Gachibowli is not offered as an area.
    expect((await call('/suggest?q=bowli')).body.items).toEqual([]);
    expect((await call('/suggest?q=city')).body.items[0]).toMatchObject({ kind: 'area', label: 'HiTech City' });
    const sun = (await call('/suggest?q=SUN')).body.items.map((s: { label: string }) => s.label);
    // Both start with "sun"; the verified partner comes first, and the pending listing never shows.
    expect(sun).toEqual(['Sunrise Residency', 'Sunshine PG']);
    expect((await call('/suggest?q=nest')).body.items.map((s: { label: string }) => s.label)).toEqual(['Green Nest']);
    expect((await call('/suggest?q=su&limit=1')).body.items).toHaveLength(1);
  });

  test('wildcards match literally, and too little or too much text is refused', async () => {
    expect((await call(`/suggest?q=${encodeURIComponent('%%')}`)).body).toEqual({ q: '%%', items: [] });
    expect((await call(`/suggest?q=${encodeURIComponent('__')}`)).body.items).toEqual([]);
    const short = await call('/suggest?q=%20s%20');
    expect(short.status).toBe(400);
    expect(short.body.issues[0].message).toBe('Type at least 2 characters');
    expect((await call(`/suggest?q=${'x'.repeat(81)}`)).status).toBe(400);
  });
});

describe('visit requests', () => {
  test('a form sent twice at once makes one request', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, { rooms: [ROOM] });
    const seeker = await newTenant('Double Tapper');
    const body = { preferredDate: addDays(TODAY, 2), message: 'Evening' };
    // Warm the connection pool first, so the six requests really overlap instead of queueing for connections.
    await Promise.all(Array.from({ length: 8 }, () => call('/me/visits', { token: seeker.token })));
    const results = await Promise.all(Array.from({ length: 6 }, () => call(`/hostels/${hostel.id}/visits`, { token: seeker.token, body })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    for (const r of results.filter((x) => x.status !== 201)) {
      expect(r.status).toBe(409);
      expect(r.body.message).toBe('You already have a visit request waiting at this hostel');
    }
    expect((await call('/me/visits', { token: seeker.token })).body).toHaveLength(1);
  });

  test('an owner cannot request a visit at their own hostel', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, { rooms: [ROOM] });
    const res = await call(`/hostels/${hostel.id}/visits`, { token: ownerToken, body: { preferredDate: addDays(TODAY, 1) } });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This is your own hostel, so there is no visit to request.');
    // Any other hostel is fine for them.
    const other = await liveHostel(await newOwner(), adminToken, { rooms: [ROOM] });
    expect((await call(`/hostels/${other.hostel.id}/visits`, { token: ownerToken, body: { preferredDate: addDays(TODAY, 1) } })).status).toBe(201);
  });

  test(`dates run from today to ${VISIT_MAX_DAYS_AHEAD} days ahead`, async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, { rooms: [ROOM] });
    const ask = async (preferredDate: string) => {
      const t = await newTenant('Planner');
      return call(`/hostels/${hostel.id}/visits`, { token: t.token, body: { preferredDate } });
    };
    expect((await ask(TODAY)).status).toBe(201);
    expect((await ask(addDays(TODAY, VISIT_MAX_DAYS_AHEAD))).status).toBe(201);
    const late = await ask(addDays(TODAY, VISIT_MAX_DAYS_AHEAD + 1));
    expect(late.status).toBe(400);
    expect(late.body.issues[0]).toEqual({ path: 'preferredDate', message: 'Pick a date in the next 90 days (by 7 Feb 2027)' });
    const past = await ask(addDays(TODAY, -1));
    expect(past.status).toBe(400);
    expect(past.body.issues[0].message).toBe('Pick today or a later date');
    expect((await ask('2099-01-10')).status).toBe(400);
  });

  test('after withdrawing, the same person can ask again', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, { rooms: [ROOM] });
    const seeker = await newTenant('Second Try');
    const first = await call(`/hostels/${hostel.id}/visits`, { token: seeker.token, body: { preferredDate: addDays(TODAY, 1) } });
    expect((await call(`/me/visits/${first.body.id}`, { token: seeker.token, method: 'DELETE' })).status).toBe(200);
    expect((await call(`/hostels/${hostel.id}/visits`, { token: seeker.token, body: { preferredDate: addDays(TODAY, 3) } })).status).toBe(201);
  });
});
