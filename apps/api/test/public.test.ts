import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { addDays, istDate, newId, weekStart } from '@hostels/shared';
import { db, schema } from '../src/db';
import { createHostel, login, req, truncateAll } from './helpers';

beforeEach(truncateAll);

async function owner() {
  return (await login('owner')).user;
}

describe('GET /hostels', () => {
  test('lists only live hostels with summary fields', async () => {
    const o = await owner();
    const { hostel } = await createHostel(o.id, { name: 'Live One' });
    await createHostel(o.id, { name: 'Draft One', status: 'draft' });
    await db.insert(schema.hostelPhotos).values({ id: newId('pho'), hostelId: hostel.id, url: 'https://x/cover.jpg', sortOrder: 0 });
    const r = await req('GET', '/hostels');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.items[0]).toMatchObject({
      name: 'Live One',
      coverPhotoUrl: 'https://x/cover.jpg',
      minRent: 9000,
      sharingTypes: ['2-sharing'],
      bedsAvailable: 5,
      rating: null,
      reviewCount: 0,
    });
    expect(r.body.items[0].distanceKm).toBeUndefined();
  });

  test('filters by area slug, gender, rent, sharing, verified, food', async () => {
    const o = await owner();
    await createHostel(o.id, { name: 'A', area: 'HITEC City', genderType: 'girls' }, { monthlyRent: 7000, sharing: '3-sharing' });
    await createHostel(o.id, { name: 'B', area: 'Madhapur', partnerStatus: 'none', foodAvailable: false }, { monthlyRent: 12000 });
    const names = async (qs: string) => (await req('GET', `/hostels?${qs}`)).body.items.map((h: { name: string }) => h.name).sort();
    expect(await names('area=hitec-city')).toEqual(['A']);
    expect(await names('area=Madhapur')).toEqual(['B']);
    expect(await names('gender=girls')).toEqual(['A']);
    expect(await names('maxRent=8000')).toEqual(['A']);
    expect(await names('minRent=10000')).toEqual(['B']);
    expect(await names('sharing=3-sharing')).toEqual(['A']);
    expect(await names('verified=true')).toEqual(['A']);
    expect(await names('verified=false')).toEqual(['A', 'B']);
    expect(await names('food=true')).toEqual(['A']);
    expect(await names('q=madha')).toEqual(['B']);
  });

  test('distance sort uses haversine and returns distanceKm', async () => {
    const o = await owner();
    await createHostel(o.id, { name: 'Far', lat: 17.5, lng: 78.5 });
    await createHostel(o.id, { name: 'Near', lat: 17.441, lng: 78.351 });
    const r = await req('GET', '/hostels?lat=17.44&lng=78.35&sort=distance');
    expect(r.body.items.map((h: { name: string }) => h.name)).toEqual(['Near', 'Far']);
    expect(r.body.items[0].distanceKm).toBeLessThan(1);
    expect(r.body.items[1].distanceKm).toBeGreaterThan(10);
  });

  test('recommended ranks verified, then pro, then rating', async () => {
    const o = await owner();
    await createHostel(o.id, { name: 'Free', partnerStatus: 'none' });
    await createHostel(o.id, { name: 'Pro', partnerStatus: 'none', ownerPlan: 'pro' });
    await createHostel(o.id, { name: 'Verified' });
    const r = await req('GET', '/hostels');
    expect(r.body.items.map((h: { name: string }) => h.name)).toEqual(['Verified', 'Pro', 'Free']);
  });

  test('price sorts and pagination', async () => {
    const o = await owner();
    for (const rent of [8000, 6000, 10000]) await createHostel(o.id, { name: `R${rent}` }, { monthlyRent: rent });
    const asc = await req('GET', '/hostels?sort=price_asc&pageSize=2');
    expect(asc.body.items.map((h: { name: string }) => h.name)).toEqual(['R6000', 'R8000']);
    expect(asc.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    const p2 = await req('GET', '/hostels?sort=price_asc&pageSize=2&page=2');
    expect(p2.body.items.map((h: { name: string }) => h.name)).toEqual(['R10000']);
    const desc = await req('GET', '/hostels?sort=price_desc');
    expect(desc.body.items[0].name).toBe('R10000');
  });

  test('invalid query is a validation error', async () => {
    const r = await req('GET', '/hostels?sharing=9-sharing');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation');
  });
});

describe('hostel pages', () => {
  test('detail includes photos, rooms, rating and issue stats; drafts 404', async () => {
    const o = await owner();
    const { hostel } = await createHostel(o.id);
    const { hostel: draft } = await createHostel(o.id, { status: 'draft' });
    const r = await req('GET', `/hostels/${hostel.slug}`);
    expect(r.status).toBe(200);
    expect(r.body.roomTypes).toHaveLength(1);
    expect(r.body.rating).toMatchObject({ count: 0, overall: null });
    expect(r.body.issueStats).toMatchObject({ last90Days: 0, open: 0 });
    expect((await req('GET', `/hostels/${draft.slug}`)).status).toBe(404);
  });

  test('menu for verified partners; null otherwise', async () => {
    const o = await owner();
    const { hostel } = await createHostel(o.id);
    const { hostel: free } = await createHostel(o.id, { partnerStatus: 'none' });
    const ws = weekStart(istDate());
    const mnw = newId('mnw');
    await db.insert(schema.menuWeeks).values({ id: mnw, hostelId: hostel.id, weekStart: ws, theme: 'South Indian week' });
    await db.insert(schema.menuItems).values([
      { id: newId('mni'), menuWeekId: mnw, date: ws, meal: 'dinner', vegDish: 'Dosa' },
      { id: newId('mni'), menuWeekId: mnw, date: ws, meal: 'breakfast', vegDish: 'Idli', nonVegDish: 'Egg' },
    ]);
    const r = await req('GET', `/hostels/${hostel.slug}/menu`);
    expect(r.body.theme).toBe('South Indian week');
    expect(r.body.items.map((i: { meal: string }) => i.meal)).toEqual(['breakfast', 'dinner']);
    expect((await req('GET', `/hostels/${hostel.slug}/menu?week=${addDays(ws, 7)}`)).body).toBeNull();
    expect((await req('GET', `/hostels/${free.slug}/menu`)).body).toBeNull();
  });

  test('reviews: published only, with author name', async () => {
    const o = await owner();
    const { hostel } = await createHostel(o.id);
    const t = await login('tenant', undefined, 'Kiran');
    const t2 = await login('tenant', undefined, 'Hidden');
    const base = { hostelId: hostel.id, overall: 4, cleanliness: 4, safety: 5, value: 4, staff: 4, title: 'Good', body: 'Lived here a year, it was great overall.' };
    await db.insert(schema.reviews).values([
      { id: newId('rev'), userId: t.user.id, ...base },
      { id: newId('rev'), userId: t2.user.id, ...base, status: 'hidden' },
    ]);
    const r = await req('GET', `/hostels/${hostel.slug}/reviews`);
    expect(r.body.total).toBe(1);
    expect(r.body.items[0]).toMatchObject({ author: { name: 'Kiran' }, verifiedResident: true, overall: 4 });
    const detail = await req('GET', `/hostels/${hostel.slug}`);
    expect(detail.body.rating).toMatchObject({ count: 1, overall: 4 });
  });

  test('public issues hide reporter and private issues', async () => {
    const o = await owner();
    const { hostel } = await createHostel(o.id);
    const t = await login();
    const base = { hostelId: hostel.id, reporterId: t.user.id, category: 'wifi' as const, title: 'WiFi down', description: 'No internet on floor 2' };
    await db.insert(schema.issues).values([
      { id: newId('iss'), ...base },
      { id: newId('iss'), ...base, isPublic: false, title: 'Private' },
    ]);
    const r = await req('GET', `/hostels/${hostel.slug}/issues`);
    expect(r.body.total).toBe(1);
    expect(r.body.items[0]).toMatchObject({ title: 'WiFi down', reporter: null, upvotes: 0, upvotedByMe: false });
  });

  test('view counter increments per day', async () => {
    const o = await owner();
    const { hostel } = await createHostel(o.id);
    await req('POST', `/hostels/${hostel.slug}/view`);
    await req('POST', `/hostels/${hostel.slug}/view`);
    const [row] = await db.select().from(schema.hostelViews).where(eq(schema.hostelViews.hostelId, hostel.id));
    expect(row!.count).toBe(2);
    expect((await req('POST', '/hostels/nope/view')).status).toBe(404);
  });

  test('areas and food partners', async () => {
    const o = await owner();
    await createHostel(o.id, { area: 'HITEC City' }, { monthlyRent: 7000 });
    await createHostel(o.id, { area: 'HITEC City' }, { monthlyRent: 9000 });
    await createHostel(o.id, { area: 'Kondapur', status: 'pending' });
    await db.insert(schema.foodPartners).values([
      { id: newId('fdp'), name: 'EatSure', cuisine: 'Multi' },
      { id: newId('fdp'), name: 'Old', cuisine: 'x', active: false },
    ]);
    const a = await req('GET', '/areas');
    expect(a.body).toEqual([{ city: 'Hyderabad', area: 'HITEC City', slug: 'hitec-city', hostelCount: 2, minRent: 7000 }]);
    const f = await req('GET', '/food-partners');
    expect(f.body.map((p: { name: string }) => p.name)).toEqual(['EatSure']);
  });
});

describe('visit requests', () => {
  test('signed-in user can request a visit; shows in /me/visits', async () => {
    const o = await owner();
    const { hostel } = await createHostel(o.id, { partnerStatus: 'none' });
    const t = await login();
    expect((await req('POST', `/hostels/${hostel.id}/visits`, { body: { preferredDate: istDate() } })).status).toBe(401);
    const r = await req('POST', `/hostels/${hostel.id}/visits`, { token: t.token, body: { preferredDate: addDays(istDate(), 1), message: 'Evening?' } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'new', message: 'Evening?' });
    const past = await req('POST', `/hostels/${hostel.id}/visits`, { token: t.token, body: { preferredDate: addDays(istDate(), -1) } });
    expect(past.status).toBe(400);
    const mine = await req('GET', '/me/visits', { token: t.token });
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].hostel.slug).toBe(hostel.slug);
  });
});
