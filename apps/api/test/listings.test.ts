import { beforeEach, describe, expect, test } from 'bun:test';
import { admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

let ownerToken: string;
let adminToken: string;

beforeEach(async () => {
  await resetDb();
  ownerToken = await newOwner();
  adminToken = await admin();
});

describe('listing lifecycle', () => {
  test('draft → submit needs rooms and photos → admin approves → public', async () => {
    const h = await call('/owner/hostels', {
      token: ownerToken,
      body: { name: 'Lotus PG', area: 'Madhapur', lat: 17.45, lng: 78.39, genderType: 'girls', contactPhone: '9876500001' },
    });
    expect(h.status).toBe(201);
    expect(h.body).toMatchObject({ status: 'draft', partnerStatus: 'none', slug: 'lotus-pg-madhapur' });

    const early = await call(`/owner/hostels/${h.body.id}/submit`, { token: ownerToken, method: 'POST' });
    expect(early.body.error).toBe('invalid_state');
    expect(early.body.message).toContain('room type');

    await call(`/owner/hostels/${h.body.id}/rooms`, {
      token: ownerToken,
      body: { sharing: '3-sharing', monthlyRent: 7000, advanceAmount: 7000, totalBeds: 9, bedsAvailable: 3 },
    });
    await call(`/owner/hostels/${h.body.id}/photos`, { token: ownerToken, body: { url: 'https://example.com/p.jpg' } });
    expect((await call(`/owner/hostels/${h.body.id}/submit`, { token: ownerToken, method: 'POST' })).body.status).toBe('pending');
    expect((await call('/hostels/lotus-pg-madhapur')).status).toBe(404);

    const queue = await call('/admin/hostels?status=pending', { token: adminToken });
    expect(queue.body.map((x: { id: string }) => x.id)).toEqual([h.body.id]);
    await call(`/admin/hostels/${h.body.id}/approve`, { token: adminToken, method: 'POST' });

    const pub = await call('/hostels/lotus-pg-madhapur');
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ status: 'live', isVerified: false, transparency: null });
    expect(pub.body.roomTypes[0]).toMatchObject({ advanceAmount: 7000, bedsAvailable: 3 });
    expect(pub.body.ratings).toMatchObject({ rating: null, reviewCount: 0 });

    // Editing a live listing keeps it live.
    const edited = await call(`/owner/hostels/${h.body.id}`, { token: ownerToken, method: 'PATCH', body: { description: 'Updated' } });
    expect(edited.body.status).toBe('live');
  });

  test('rejection carries a reason and editing returns it to draft', async () => {
    const h = await call('/owner/hostels', {
      token: ownerToken,
      body: { name: 'Shady Stay', area: 'Ameerpet', lat: 17.43, lng: 78.44, genderType: 'boys', contactPhone: '9876500002' },
    });
    await call(`/owner/hostels/${h.body.id}/rooms`, { token: ownerToken, body: { sharing: '4-sharing', monthlyRent: 5000, totalBeds: 4, bedsAvailable: 4 } });
    await call(`/owner/hostels/${h.body.id}/photos`, { token: ownerToken, body: { url: 'https://example.com/p.jpg' } });
    await call(`/owner/hostels/${h.body.id}/submit`, { token: ownerToken, method: 'POST' });
    const rej = await call(`/admin/hostels/${h.body.id}/reject`, { token: adminToken, body: { reason: 'Photos look like stock images' } });
    expect(rej.body).toMatchObject({ status: 'rejected', rejectionReason: 'Photos look like stock images' });
    const edit = await call(`/owner/hostels/${h.body.id}`, { token: ownerToken, method: 'PATCH', body: { name: 'Sunny Stay' } });
    expect(edit.body).toMatchObject({ status: 'draft', rejectionReason: null });
  });

  test('owners only touch their own hostels and rooms', async () => {
    const { hostel, rooms } = await liveHostel(ownerToken, adminToken);
    const other = await newOwner();
    expect((await call(`/owner/hostels/${hostel.id}`, { token: other })).status).toBe(404);
    expect((await call(`/owner/rooms/${rooms[0].id}`, { token: other, method: 'PATCH', body: { bedsAvailable: 0 } })).status).toBe(404);
    const { token: tenant } = await newTenant();
    expect((await call('/owner/hostels', { token: tenant })).status).toBe(403);
  });

  test('beds free cannot exceed total', async () => {
    const { rooms } = await liveHostel(ownerToken, adminToken);
    const bad = await call(`/owner/rooms/${rooms[0].id}`, { token: ownerToken, method: 'PATCH', body: { bedsAvailable: 99 } });
    expect(bad.status).toBe(400);
    const ok = await call(`/owner/rooms/${rooms[0].id}`, { token: ownerToken, method: 'PATCH', body: { bedsAvailable: 0 } });
    expect(ok.body.bedsAvailable).toBe(0);
  });
});

describe('partner flow', () => {
  test('apply → verify sets the fee, zeroes advances and starts the Partner plan with a free month', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, {
      rooms: [{ sharing: '2-sharing', monthlyRent: 9000, advanceAmount: 18000, totalBeds: 4, bedsAvailable: 2 }],
    });
    expect((await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken, method: 'POST' })).body.partnerStatus).toBe('applied');
    expect((await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken, method: 'POST' })).body.error).toBe('invalid_state');
    const v = await call(`/admin/hostels/${hostel.id}/partner/verify`, { token: adminToken, body: { platformFeePct: 12 } });
    expect(v.body).toMatchObject({ partnerStatus: 'verified', platformFeePct: 12 });

    const detail = await call(`/hostels/${hostel.slug}`);
    expect(detail.body.isVerified).toBe(true);
    expect(detail.body.roomTypes[0].advanceAmount).toBe(0);

    const plan = await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken });
    expect(plan.body).toMatchObject({ price: 1999, inTrial: true, partnerStatus: 'verified' });
    expect(plan.body.plan.plan).toBe('partner');
  });

  test('a draft cannot apply; rejection records the reason', async () => {
    const h = await call('/owner/hostels', {
      token: ownerToken,
      body: { name: 'Draft House', area: 'Kondapur', lat: 17.47, lng: 78.36, genderType: 'boys', contactPhone: '9876500003' },
    });
    expect((await call(`/owner/hostels/${h.body.id}/partner`, { token: ownerToken, method: 'POST' })).body.error).toBe('invalid_state');
    const { hostel } = await liveHostel(ownerToken, adminToken);
    await call(`/owner/hostels/${hostel.id}/partner`, { token: ownerToken, method: 'POST' });
    const r = await call(`/admin/hostels/${hostel.id}/partner/reject`, { token: adminToken, body: { reason: 'Kitchen not inspected' } });
    expect(r.body).toMatchObject({ partnerStatus: 'rejected', rejectionReason: 'Kitchen not inspected' });
  });
});

describe('search', () => {
  beforeEach(async () => {
    await liveHostel(ownerToken, adminToken, {
      name: 'Alpha', area: 'Gachibowli', lat: 17.4401, lng: 78.3489, partner: true, genderType: 'boys',
      rooms: [{ sharing: '2-sharing', monthlyRent: 12000, totalBeds: 4, bedsAvailable: 2 }],
    });
    await liveHostel(ownerToken, adminToken, {
      name: 'Bravo', area: 'Ameerpet', lat: 17.4375, lng: 78.4483, genderType: 'girls', foodAvailable: false,
      rooms: [{ sharing: '4-sharing', monthlyRent: 5500, totalBeds: 8, bedsAvailable: 0 }, { sharing: 'private', monthlyRent: 15000, totalBeds: 2, bedsAvailable: 1 }],
    });
    await liveHostel(ownerToken, adminToken, {
      name: 'Charlie', area: 'Madhapur', lat: 17.4483, lng: 78.3915, genderType: 'coliving',
      rooms: [{ sharing: '3-sharing', monthlyRent: 8000, totalBeds: 6, bedsAvailable: 3 }],
    });
  });

  const names = (body: { items: { name: string }[] }) => body.items.map((i) => i.name);

  test('filters', async () => {
    expect(names((await call('/hostels?area=ameerpet')).body)).toEqual(['Bravo']);
    expect(names((await call('/hostels?verified=true')).body)).toEqual(['Alpha']);
    expect(names((await call('/hostels?gender=girls')).body)).toEqual(['Bravo']);
    expect(names((await call('/hostels?food=true&sort=rent_asc')).body)).toEqual(['Charlie', 'Alpha']);
    expect(names((await call('/hostels?maxRent=9000&sort=rent_asc')).body)).toEqual(['Bravo', 'Charlie']);
    expect(names((await call('/hostels?sharing=private')).body)).toEqual(['Bravo']);
    expect(names((await call('/hostels?q=char')).body)).toEqual(['Charlie']);
  });

  test('only live listings are searchable, and an area with none returns an empty page', async () => {
    const pending = await call('/owner/hostels', {
      token: ownerToken,
      body: { name: 'Delta', area: 'Gachibowli', lat: 17.44, lng: 78.35, genderType: 'boys', contactPhone: '9876500004' },
    });
    await call(`/owner/hostels/${pending.body.id}/rooms`, { token: ownerToken, body: { sharing: '2-sharing', monthlyRent: 9000, totalBeds: 4, bedsAvailable: 4 } });
    await call(`/owner/hostels/${pending.body.id}/photos`, { token: ownerToken, body: { url: 'https://example.com/p.jpg' } });
    expect((await call(`/owner/hostels/${pending.body.id}/submit`, { token: ownerToken, method: 'POST' })).body.status).toBe('pending');

    expect((await call('/hostels?q=delta')).body).toMatchObject({ total: 0, items: [] });
    expect(names((await call('/hostels?area=gachibowli')).body)).toEqual(['Alpha']);
    expect((await call('/hostels?area=Kondapur')).body).toMatchObject({ total: 0, items: [] });
  });

  test('rent bounds include a room at exactly that rent', async () => {
    expect(names((await call('/hostels?maxRent=8000&sort=rent_asc')).body)).toEqual(['Bravo', 'Charlie']);
    expect(names((await call('/hostels?minRent=12000&sort=rent_asc')).body)).toEqual(['Alpha', 'Bravo']);
  });

  test('summaries carry the cheapest matching room, beds free and the cover photo', async () => {
    const res = await call('/hostels?q=bravo');
    expect(res.body.items[0]).toMatchObject({ minRent: 5500, bedsAvailable: 1, coverPhotoUrl: 'https://example.com/a.jpg', isVerified: false });
    expect(res.body.items[0].sharingTypes.sort()).toEqual(['4-sharing', 'private']);
    const filtered = await call('/hostels?q=bravo&sharing=private');
    expect(filtered.body.items[0].minRent).toBe(15000);
  });

  test('near me sorts by haversine distance and filters by radius', async () => {
    // From HiTech City: Madhapur ~1.6 km, Gachibowli ~3 km, Ameerpet ~7.5 km.
    const res = await call('/hostels?lat=17.4435&lng=78.3772&sort=distance');
    expect(names(res.body)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(res.body.items[0].distanceKm).toBeGreaterThan(1);
    expect(res.body.items[0].distanceKm).toBeLessThan(2.5);
    expect(res.body.items[2].distanceKm).toBeGreaterThan(6);
    expect(names((await call('/hostels?lat=17.4435&lng=78.3772&radiusKm=4&sort=distance')).body)).toEqual(['Charlie', 'Alpha']);
  });

  test('recommended puts verified partners first; pagination reports the total', async () => {
    const res = await call('/hostels?limit=2');
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].name).toBe('Alpha');
    expect((await call('/hostels?limit=2&page=2')).body.items).toHaveLength(1);
    expect((await call('/hostels?sort=nope')).status).toBe(400);
  });

  test('areas list', async () => {
    const res = await call('/areas');
    expect(res.body.map((a: { area: string }) => a.area)).toEqual(['Ameerpet', 'Gachibowli', 'Madhapur']);
    expect(res.body[0].slug).toBe('ameerpet');
  });
});

describe('visit requests', () => {
  test('tenant requests, owner moves it through the inbox', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken);
    const { token } = await newTenant('Visitor');
    const v = await call(`/hostels/${hostel.id}/visits`, { token, body: { preferredDate: '2099-01-10', message: 'Evening please' } });
    expect(v.status).toBe(201);
    expect((await call(`/hostels/${hostel.id}/visits`, { token, body: { preferredDate: '2099-01-11' } })).body.error).toBe('invalid_state');
    expect((await call(`/hostels/${hostel.id}/visits`, { token, body: { preferredDate: '2000-01-01' } })).status).toBe(400);

    const inbox = await call('/owner/visits?status=new', { token: ownerToken });
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0].visitor.name).toBe('Visitor');
    const moved = await call(`/owner/visits/${v.body.id}`, { token: ownerToken, method: 'PATCH', body: { status: 'contacted' } });
    expect(moved.body.status).toBe('contacted');
    expect((await call('/me/visits', { token })).body[0].status).toBe('contacted');
    const stranger = await newOwner();
    expect((await call(`/owner/visits/${v.body.id}`, { token: stranger, method: 'PATCH', body: { status: 'closed' } })).status).toBe(404);
  });
});
