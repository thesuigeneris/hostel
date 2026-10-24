import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { addDays, newId, weekStart } from '@hostels/shared';
import { db, schema } from '../src/db';
import { createHostel, login, loginAdmin, req, truncateAll } from './helpers';
import { insertSubscription, ownerWithHostel, resident, today } from './community-fixtures';

beforeEach(truncateAll);

const hostelInput = {
  name: 'Green Nest',
  city: 'Hyderabad',
  area: 'Kondapur',
  address: '12 Main Road, Kondapur',
  lat: 17.46,
  lng: 78.35,
  genderType: 'coliving',
  contactPhone: '9876543210',
  amenities: ['WiFi'],
  foodAvailable: true,
};

describe('owner guards', () => {
  test('requires sign-in and the owner role', async () => {
    expect((await req('GET', '/owner/dashboard')).status).toBe(401);
    const t = await login('tenant');
    expect((await req('GET', '/owner/dashboard', { token: t.token })).status).toBe(403);
    const o = await login('owner');
    expect((await req('GET', '/owner/dashboard', { token: o.token })).status).toBe(200);
  });

  test("owners cannot touch other owners' hostels", async () => {
    const a = await ownerWithHostel();
    const b = await login('owner');
    expect((await req('GET', `/owner/hostels/${a.hostel.id}`, { token: b.token })).status).toBe(404);
    expect((await req('PATCH', `/owner/hostels/${a.hostel.id}`, { token: b.token, body: { name: 'Mine now' } })).status).toBe(404);
    expect((await req('PATCH', `/owner/rooms/${a.roomType.id}`, { token: b.token, body: { monthlyRent: 1 } })).status).toBe(404);
    const admin = await loginAdmin();
    expect((await req('GET', `/owner/hostels/${a.hostel.id}`, { token: admin.token })).status).toBe(200);
  });
});

describe('listing lifecycle', () => {
  test('create → submit (needs room + photo) → admin approves → edit stays live', async () => {
    const o = await login('owner');
    const created = await req('POST', '/owner/hostels', { token: o.token, body: hostelInput });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'draft', slug: 'green-nest-kondapur', partnerStatus: 'none', ownerPlan: 'free' });
    const id = created.body.id;

    const again = await req('POST', '/owner/hostels', { token: o.token, body: hostelInput });
    expect(again.body.slug).toBe('green-nest-kondapur-2');

    const early = await req('POST', `/owner/hostels/${id}/submit`, { token: o.token });
    expect(early.status).toBe(400);
    expect(early.body.issues.map((i: any) => i.path).sort()).toEqual(['photos', 'rooms']);

    expect((await req('POST', `/owner/hostels/${id}/apply-partner`, { token: o.token })).body.error).toBe('invalid_transition');

    const room = await req('POST', `/owner/hostels/${id}/rooms`, { token: o.token, body: { sharing: '2-sharing', monthlyRent: 9000, totalBeds: 10, bedsAvailable: 4 } });
    expect(room.status).toBe(201);
    expect((await req('POST', `/owner/hostels/${id}/photos`, { token: o.token, body: { url: 'https://example.com/a.jpg' } })).status).toBe(201);

    const submitted = await req('POST', `/owner/hostels/${id}/submit`, { token: o.token });
    expect(submitted.body.status).toBe('pending');
    expect((await req('POST', `/owner/hostels/${id}/submit`, { token: o.token })).body.error).toBe('invalid_transition');

    const admin = await loginAdmin();
    expect((await req('POST', `/admin/hostels/${id}/approve`, { token: admin.token })).body.status).toBe('live');

    const edited = await req('PATCH', `/owner/hostels/${id}`, { token: o.token, body: { description: 'Now with a terrace' } });
    expect(edited.body).toMatchObject({ status: 'live', description: 'Now with a terrace' });

    expect((await req('POST', `/owner/hostels/${id}/apply-partner`, { token: o.token })).body.partnerStatus).toBe('applied');

    const detail = await req('GET', `/owner/hostels/${id}`, { token: o.token });
    expect(detail.body.roomTypes).toHaveLength(1);
    expect(detail.body.photos).toHaveLength(1);
    expect(detail.body.rating.count).toBe(0);
    expect(detail.body.issueStats.last90Days).toBe(0);
    expect((await req('GET', '/owner/hostels', { token: o.token })).body).toHaveLength(2);
  });

  test('rejected listing goes back to draft when edited', async () => {
    const o = await login('owner');
    const { hostel } = await createHostel(o.user.id, { status: 'pending', partnerStatus: 'none' });
    const admin = await loginAdmin();
    const rej = await req('POST', `/admin/hostels/${hostel.id}/reject`, { token: admin.token, body: { reason: 'Photos are blurry' } });
    expect(rej.body).toMatchObject({ status: 'rejected', rejectionReason: 'Photos are blurry' });
    const edited = await req('PATCH', `/owner/hostels/${hostel.id}`, { token: o.token, body: { name: 'Better Photos Hostel' } });
    expect(edited.body.status).toBe('draft');
  });
});

describe('rooms and photos', () => {
  test('beds free cannot exceed total; rooms with subscribers cannot be deleted', async () => {
    const { owner, hostel, roomType } = await ownerWithHostel();
    const bad = await req('POST', `/owner/hostels/${hostel.id}/rooms`, { token: owner.token, body: { sharing: 'private', monthlyRent: 1, totalBeds: 2, bedsAvailable: 3 } });
    expect(bad.status).toBe(400);
    expect(bad.body.issues[0].path).toBe('bedsAvailable');
    const badPatch = await req('PATCH', `/owner/rooms/${roomType.id}`, { token: owner.token, body: { bedsAvailable: 11 } });
    expect(badPatch.status).toBe(400);
    const ok = await req('PATCH', `/owner/rooms/${roomType.id}`, { token: owner.token, body: { bedsAvailable: 2, monthlyRent: 9500 } });
    expect(ok.body).toMatchObject({ bedsAvailable: 2, monthlyRent: 9500, totalBeds: 10 });

    const t = await login('tenant');
    await insertSubscription({ userId: t.user.id, hostelId: hostel.id, roomTypeId: roomType.id });
    expect((await req('DELETE', `/owner/rooms/${roomType.id}`, { token: owner.token })).status).toBe(409);

    const extra = await req('POST', `/owner/hostels/${hostel.id}/rooms`, { token: owner.token, body: { sharing: 'private', monthlyRent: 15000, totalBeds: 2, bedsAvailable: 2 } });
    expect((await req('DELETE', `/owner/rooms/${extra.body.id}`, { token: owner.token })).status).toBe(200);
  });

  test('photos can be reordered and deleted', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const ids: string[] = [];
    for (const n of ['a', 'b', 'c']) ids.push((await req('POST', `/owner/hostels/${hostel.id}/photos`, { token: owner.token, body: { url: `https://x.test/${n}.jpg` } })).body.id);
    const reordered = await req('PUT', `/owner/hostels/${hostel.id}/photos/order`, { token: owner.token, body: { photoIds: [ids[2], ids[0], ids[1]] } });
    expect(reordered.body.map((p: any) => p.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect((await req('PUT', `/owner/hostels/${hostel.id}/photos/order`, { token: owner.token, body: { photoIds: [ids[0]] } })).status).toBe(400);
    expect((await req('DELETE', `/owner/photos/${ids[0]}`, { token: owner.token })).status).toBe(200);
  });
});

describe('visits inbox', () => {
  test('owner sees and updates visit requests for their hostels only', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const other = await ownerWithHostel();
    const seeker = await login('tenant');
    await db.insert(schema.visitRequests).values([
      { id: newId('vis'), hostelId: hostel.id, userId: seeker.user.id, preferredDate: addDays(today(), 2), message: 'Evening?' },
      { id: newId('vis'), hostelId: other.hostel.id, userId: seeker.user.id, preferredDate: addDays(today(), 2) },
    ]);
    const list = await req('GET', '/owner/visits', { token: owner.token });
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ status: 'new', hostel: { id: hostel.id }, user: { phone: seeker.user.phone } });
    const upd = await req('PATCH', `/owner/visits/${list.body[0].id}`, { token: owner.token, body: { status: 'contacted' } });
    expect(upd.body.status).toBe('contacted');
    const otherVisit = (await req('GET', '/owner/visits', { token: other.owner.token })).body[0];
    expect((await req('PATCH', `/owner/visits/${otherVisit.id}`, { token: owner.token, body: { status: 'closed' } })).status).toBe(404);
    expect((await req('GET', `/owner/visits?hostelId=${other.hostel.id}`, { token: owner.token })).status).toBe(404);
  });
});

describe('menus and headcount', () => {
  const week = weekStart(today());

  test('menu editor is for verified partners and validates the week', async () => {
    const free = await ownerWithHostel({ partnerStatus: 'none' });
    const body = { theme: 'South Indian week', items: [{ date: week, meal: 'lunch', vegDish: 'Sambar rice', nonVegDish: 'Chicken fry' }] };
    const denied = await req('PUT', `/owner/hostels/${free.hostel.id}/menu?week=${week}`, { token: free.owner.token, body });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('not_verified');

    const { owner, hostel } = await ownerWithHostel();
    expect((await req('PUT', `/owner/hostels/${hostel.id}/menu?week=${addDays(week, 1)}`, { token: owner.token, body })).status).toBe(400);
    const outside = await req('PUT', `/owner/hostels/${hostel.id}/menu?week=${week}`, {
      token: owner.token,
      body: { theme: 'x', items: [{ date: addDays(week, 7), meal: 'lunch', vegDish: 'Dal' }] },
    });
    expect(outside.status).toBe(400);

    const saved = await req('PUT', `/owner/hostels/${hostel.id}/menu?week=${week}`, { token: owner.token, body });
    expect(saved.body).toMatchObject({ weekStart: week, theme: 'South Indian week', items: [{ meal: 'lunch', vegDish: 'Sambar rice', nonVegDish: 'Chicken fry', foodPartner: null }] });

    // PUT replaces the whole week.
    const replaced = await req('PUT', `/owner/hostels/${hostel.id}/menu?week=${week}`, {
      token: owner.token,
      body: { theme: 'Hyderabadi week', items: [{ date: week, meal: 'dinner', vegDish: 'Veg biryani' }, { date: addDays(week, 1), meal: 'breakfast', vegDish: 'Idli' }] },
    });
    expect(replaced.body.items).toHaveLength(2);

    const next = addDays(week, 7);
    expect((await req('GET', `/owner/hostels/${hostel.id}/menu?week=${next}`, { token: owner.token })).body).toBeNull();
    const copied = await req('POST', `/owner/hostels/${hostel.id}/menu/copy-last?week=${next}`, { token: owner.token });
    expect(copied.body.theme).toBe('Hyderabadi week');
    expect(copied.body.items.map((i: any) => i.date)).toEqual([next, addDays(next, 1)]);
    expect((await req('POST', `/owner/hostels/${hostel.id}/menu/copy-last?week=${addDays(week, 21)}`, { token: owner.token })).status).toBe(404);
  });

  test('headcount counts plan meals, subtracts skips and splits diet', async () => {
    const { owner, hostel, roomType } = await ownerWithHostel();
    const date = addDays(today(), 1);
    const users = await Promise.all([1, 2, 3, 4].map(() => login('tenant')));
    const [a, b, c, d] = users.map((u) => u.user.id) as [string, string, string, string];
    const sa = await insertSubscription({ userId: a, hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'full', diet: 'veg' });
    await insertSubscription({ userId: b, hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'two-meals', diet: 'non-veg' });
    await insertSubscription({ userId: c, hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'full', diet: 'non-veg', status: 'pending' });
    await insertSubscription({ userId: d, hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'none', diet: 'veg' });
    await db.insert(schema.mealSkips).values({ id: newId('skp'), subscriptionId: sa.id, date, meal: 'lunch', creditAmount: 80 });

    const r = await req('GET', `/owner/hostels/${hostel.id}/headcount?date=${date}`, { token: owner.token });
    expect(r.status).toBe(200);
    const by = Object.fromEntries(r.body.meals.map((m: any) => [m.meal, m]));
    expect(by.breakfast).toMatchObject({ total: 2, veg: 1, nonVeg: 1, skipped: 0 });
    expect(by.lunch).toMatchObject({ total: 0, veg: 0, nonVeg: 0, skipped: 1 });
    expect(by.dinner).toMatchObject({ total: 2, veg: 1, nonVeg: 1 });
  });

  test('headcount follows scheduled moves', async () => {
    const { owner, hostel, roomType } = await ownerWithHostel();
    const dest = await createHostel(owner.user.id);
    const t = await login('tenant');
    const sub = await insertSubscription({ userId: t.user.id, hostelId: hostel.id, roomTypeId: roomType.id });
    const moveDate = addDays(today(), 3);
    await db.insert(schema.moveRequests).values({
      id: newId('mov'),
      subscriptionId: sub.id,
      fromHostelId: hostel.id,
      fromRoomTypeId: roomType.id,
      toHostelId: dest.hostel.id,
      toRoomTypeId: dest.roomType.id,
      moveDate,
    });
    const before = await req('GET', `/owner/hostels/${hostel.id}/headcount?date=${addDays(moveDate, -1)}`, { token: owner.token });
    expect(before.body.meals[0].total).toBe(1);
    const after = await req('GET', `/owner/hostels/${hostel.id}/headcount?date=${moveDate}`, { token: owner.token });
    expect(after.body.meals[0].total).toBe(0);
    const atDest = await req('GET', `/owner/hostels/${dest.hostel.id}/headcount?date=${moveDate}`, { token: owner.token });
    expect(atDest.body.meals[0].total).toBe(1);
  });

  test('subscribers list shows tenant and overdue count', async () => {
    const { owner, hostel, roomType } = await ownerWithHostel();
    const t = await login('tenant', undefined, 'Sub Scriber');
    const sub = await insertSubscription({ userId: t.user.id, hostelId: hostel.id, roomTypeId: roomType.id });
    await db.insert(schema.invoices).values({
      id: newId('inv'),
      subscriptionId: sub.id,
      userId: t.user.id,
      hostelId: hostel.id,
      roomTypeId: roomType.id,
      periodStart: addDays(today(), -40),
      periodEnd: addDays(today(), -10),
      rentAmount: 9000,
      foodAmount: 6000,
      totalAmount: 15000,
      dueDate: addDays(today(), -20),
    });
    const r = await req('GET', `/owner/hostels/${hostel.id}/subscribers`, { token: owner.token });
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ id: sub.id, user: { name: 'Sub Scriber' }, hostel: { id: hostel.id }, overdueInvoices: 1 });
  });
});

describe('residents, plan gating and Hostels Pro', () => {
  test('free hostels cannot use Pro features', async () => {
    const { owner, hostel } = await ownerWithHostel({ ownerPlan: 'free' });
    const add = await req('POST', `/owner/hostels/${hostel.id}/residents`, { token: owner.token, body: { phone: '9811111111', name: 'Kiran', startDate: today() } });
    expect(add.status).toBe(402);
    expect(add.body.error).toBe('plan_required');
    expect((await req('POST', `/owner/hostels/${hostel.id}/announcements`, { token: owner.token, body: { body: 'Water off at 2pm' } })).status).toBe(402);
    const r = await resident(hostel.id);
    expect((await req('GET', `/owner/residencies/${r.residency.id}/rent`, { token: owner.token })).status).toBe(402);
  });

  test('claims are approved by the owner; Pro owners add residents and track rent', async () => {
    const { owner, hostel } = await ownerWithHostel({ ownerPlan: 'pro' });
    const claimant = await login('tenant', undefined, 'Claimant');
    const claim = await req('POST', '/me/residencies', { token: claimant.token, body: { hostelId: hostel.id, startDate: addDays(today(), -30), roomLabel: '204' } });
    expect(claim.status).toBe(201);
    expect(claim.body).toMatchObject({ status: 'pending', source: 'claim', roomLabel: '204' });
    expect((await req('POST', '/me/residencies', { token: claimant.token, body: { hostelId: hostel.id, startDate: today() } })).status).toBe(409);

    const added = await req('POST', `/owner/hostels/${hostel.id}/residents`, {
      token: owner.token,
      body: { phone: '9822222222', name: 'Offline Ravi', startDate: today(), roomLabel: '101', monthlyRent: 8000 },
    });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ status: 'active', source: 'owner', monthlyRent: 8000, user: { phone: '9822222222', name: 'Offline Ravi' } });

    const list = await req('GET', `/owner/hostels/${hostel.id}/residents`, { token: owner.token });
    expect(list.body.map((r: any) => r.status)).toEqual(['pending', 'active']);

    const approved = await req('PATCH', `/owner/residencies/${claim.body.id}`, { token: owner.token, body: { status: 'active' } });
    expect(approved.body.status).toBe('active');
    expect((await req('PATCH', `/owner/residencies/${claim.body.id}`, { token: owner.token, body: { status: 'rejected' } })).body.error).toBe('invalid_transition');

    const rent = await req('POST', `/owner/residencies/${added.body.id}/rent`, { token: owner.token, body: { periodMonth: '2026-10', amount: 8000, paidOn: today() } });
    expect(rent.status).toBe(201);
    expect((await req('GET', `/owner/residencies/${added.body.id}/rent`, { token: owner.token })).body).toHaveLength(1);

    const ended = await req('PATCH', `/owner/residencies/${added.body.id}`, { token: owner.token, body: { status: 'ended', endDate: today() } });
    expect(ended.body).toMatchObject({ status: 'ended', endDate: today() });

    const other = await login('owner');
    expect((await req('PATCH', `/owner/residencies/${claim.body.id}`, { token: other.token, body: { status: 'ended' } })).status).toBe(404);
  });

  test('upgrade creates a due invoice; paying it makes the hostel Pro; downgrade voids unpaid', async () => {
    const { owner, hostel } = await ownerWithHostel({ ownerPlan: 'free' });
    const up = await req('POST', `/owner/hostels/${hostel.id}/plan`, { token: owner.token, body: { plan: 'pro' } });
    expect(up.status).toBe(200);
    expect(up.body.hostel.ownerPlan).toBe('free');
    expect(up.body.invoice).toMatchObject({ plan: 'pro', amount: 999, status: 'due', dueDate: today(), periodMonth: today().slice(0, 7) });
    const again = await req('POST', `/owner/hostels/${hostel.id}/plan`, { token: owner.token, body: { plan: 'pro' } });
    expect(again.body.invoice.id).toBe(up.body.invoice.id);

    const dash = await req('GET', '/owner/dashboard', { token: owner.token });
    expect(dash.body.dueSaasInvoices).toHaveLength(1);

    // Payment (owned by the payments routes) marks the invoice paid and flips the plan.
    await db.update(schema.saasInvoices).set({ status: 'paid', paidAt: new Date() }).where(eq(schema.saasInvoices.id, up.body.invoice.id));
    await db.update(schema.hostels).set({ ownerPlan: 'pro' }).where(eq(schema.hostels.id, hostel.id));
    expect((await req('POST', `/owner/hostels/${hostel.id}/announcements`, { token: owner.token, body: { body: 'Water off at 2pm' } })).status).toBe(201);

    const down = await req('POST', `/owner/hostels/${hostel.id}/plan`, { token: owner.token, body: { plan: 'free' } });
    expect(down.body).toMatchObject({ hostel: { ownerPlan: 'free' }, invoice: null });
    // Upgrading again in the same paid month reinstates Pro without a new bill.
    const re = await req('POST', `/owner/hostels/${hostel.id}/plan`, { token: owner.token, body: { plan: 'pro' } });
    expect(re.body.hostel.ownerPlan).toBe('pro');

    const other = await ownerWithHostel({ ownerPlan: 'free' });
    const inv = await req('POST', `/owner/hostels/${other.hostel.id}/plan`, { token: other.owner.token, body: { plan: 'pro' } });
    await req('POST', `/owner/hostels/${other.hostel.id}/plan`, { token: other.owner.token, body: { plan: 'free' } });
    const list = await req('GET', '/owner/saas-invoices', { token: other.owner.token });
    expect(list.body.find((i: any) => i.id === inv.body.invoice.id).status).toBe('void');
  });

  test('announcements are pinned and listed first; reviews get owner replies', async () => {
    const { owner, hostel } = await ownerWithHostel({ ownerPlan: 'pro' });
    const r = await resident(hostel.id);
    await req('POST', `/community/${hostel.id}/posts`, { token: r.token, body: { body: 'Anyone for cricket Sunday?' } });
    const ann = await req('POST', `/owner/hostels/${hostel.id}/announcements`, { token: owner.token, body: { body: 'Pest control on Friday' } });
    expect(ann.body.kind).toBe('announcement');
    await req('POST', `/community/${hostel.id}/posts`, { token: r.token, body: { body: 'Newest post' } });
    const pinned = await req('POST', `/owner/posts/${ann.body.id}/pin`, { token: owner.token });
    expect(pinned.body.pinned).toBe(true);
    const board = await req('GET', `/community/${hostel.id}/posts`, { token: r.token });
    expect(board.body.items[0].id).toBe(ann.body.id);
    expect(board.body.items[1].body).toBe('Newest post');

    const review = await req('POST', `/hostels/${hostel.id}/reviews`, {
      token: r.token,
      body: { overall: 4, food: 4, cleanliness: 4, safety: 4, value: 4, staff: 4, title: 'Nice place', body: 'Clean rooms and friendly staff all round.' },
    });
    const reply = await req('POST', `/owner/reviews/${review.body.id}/reply`, { token: owner.token, body: { reply: 'Thank you!' } });
    expect(reply.body.ownerReply).toBe('Thank you!');
    expect(reply.body.ownerRepliedAt).not.toBeNull();
    expect((await req('GET', `/owner/hostels/${hostel.id}/reviews`, { token: owner.token })).body).toHaveLength(1);
    const other = await login('owner');
    expect((await req('POST', `/owner/reviews/${review.body.id}/reply`, { token: other.token, body: { reply: 'spam' } })).status).toBe(404);
  });

  test('dashboard shows occupancy, residents, open issues, visits and 30-day views', async () => {
    const { owner, hostel } = await ownerWithHostel({}, { totalBeds: 10, bedsAvailable: 4 });
    const r = await resident(hostel.id);
    await req('POST', `/community/${hostel.id}/issues`, { token: r.token, body: { category: 'water', title: 'No hot water', description: 'Geyser broken on 3rd floor' } });
    await db.insert(schema.visitRequests).values({ id: newId('vis'), hostelId: hostel.id, userId: r.user.id, preferredDate: today() });
    await db.insert(schema.hostelViews).values([
      { hostelId: hostel.id, day: today(), count: 12 },
      { hostelId: hostel.id, day: addDays(today(), -10), count: 5 },
      { hostelId: hostel.id, day: addDays(today(), -45), count: 100 },
    ]);
    const d = await req('GET', '/owner/dashboard', { token: owner.token });
    expect(d.body.hostels).toHaveLength(1);
    expect(d.body.hostels[0]).toMatchObject({ openIssues: 1, newVisits: 1, activeResidents: 1, occupancyPct: 60, views30d: 17, rating: null });
    expect(d.body.hostels[0].hostel).toMatchObject({ id: hostel.id, status: 'live', minRent: 9000, bedsAvailable: 4, sharingTypes: ['2-sharing'] });
  });

  test('owner payouts list only their own', async () => {
    const { owner, hostel } = await ownerWithHostel();
    const other = await ownerWithHostel();
    await db.insert(schema.payouts).values([
      { id: newId('pay'), ownerId: owner.user.id, hostelId: hostel.id, periodMonth: '2026-09', grossAmount: 1000, platformFee: 100, netAmount: 900 },
      { id: newId('pay'), ownerId: other.owner.user.id, hostelId: other.hostel.id, periodMonth: '2026-09', grossAmount: 1000, platformFee: 100, netAmount: 900 },
    ]);
    const r = await req('GET', '/owner/payouts', { token: owner.token });
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ hostelId: hostel.id, netAmount: 900, status: 'pending' });
  });
});
