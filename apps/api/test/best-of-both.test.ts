import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

let ownerToken: string;
let adminToken: string;
let hostel: { id: string; slug: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true, rooms: [{ sharing: '2-sharing', monthlyRent: 10000, totalBeds: 10, bedsAvailable: 5 }] });
  hostel = h.hostel;
  room = h.rooms[0];
});

afterEach(() => setClock(null));

describe('board likes', () => {
  test('residents like and unlike posts; counts show in the feed; outsiders cannot like', async () => {
    const a = await newTenant('Anil Kumar');
    const b = await newTenant('Bina');
    await activeSubscriber(a.token, hostel.id, room.id);
    await activeSubscriber(b.token, hostel.id, room.id);
    const post = await call(`/hostels/${hostel.id}/community`, { token: a.token, body: { kind: 'event', body: 'Cricket on Saturday?' } });

    const liked = await call(`/posts/${post.body.id}/like`, { token: b.token, method: 'PUT' });
    expect(liked.body).toEqual({ likes: 1, likedByMe: true });
    // Liking twice is a no-op.
    expect((await call(`/posts/${post.body.id}/like`, { token: b.token, method: 'PUT' })).body).toEqual({ likes: 1, likedByMe: true });
    await call(`/posts/${post.body.id}/like`, { token: ownerToken, method: 'PUT' });

    const feedA = await call(`/hostels/${hostel.id}/community`, { token: a.token });
    expect(feedA.body[0]).toMatchObject({ likes: 2, likedByMe: false });
    const feedB = await call(`/hostels/${hostel.id}/community`, { token: b.token });
    expect(feedB.body[0]).toMatchObject({ likes: 2, likedByMe: true });

    expect((await call(`/posts/${post.body.id}/like`, { token: b.token, method: 'DELETE' })).body).toEqual({ likes: 1, likedByMe: false });

    const outsider = await newTenant('Out');
    expect((await call(`/posts/${post.body.id}/like`, { token: outsider.token, method: 'PUT' })).body.error).toBe('not_a_resident');
    expect((await call('/posts/pst_missing/like', { token: b.token, method: 'PUT' })).status).toBe(404);
  });
});

describe('page views and owner insights', () => {
  test('anyone can record a view; owners on Pro/Partner see 30-day views, Free sees them locked', async () => {
    for (let k = 0; k < 3; k++) expect((await call(`/hostels/${hostel.slug}/view`, { method: 'POST' })).status).toBe(200);
    setClock('2026-11-10T06:00:00Z');
    await call(`/hostels/${hostel.slug}/view`, { method: 'POST' });
    // Unknown slugs are ignored, not errors (the page may be stale).
    expect((await call('/hostels/no-such-hostel/view', { method: 'POST' })).status).toBe(200);

    const tenant = await newTenant('Asha');
    await activeSubscriber(tenant.token, hostel.id, room.id);

    const insights = await call(`/owner/hostels/${hostel.id}/insights`, { token: ownerToken });
    expect(insights.status).toBe(200);
    expect(insights.body).toMatchObject({ hostelId: hostel.id, locked: false, views30d: 4, activeResidents: 1, openIssues: 0 });
    expect(insights.body.viewsByDay).toHaveLength(30);
    expect(insights.body.viewsByDay.at(-1)).toEqual({ day: '2026-11-10', count: 1 });
    expect(insights.body.viewsByDay.at(-2)).toEqual({ day: '2026-11-09', count: 3 });
    // 10 beds, 5 free at listing time, one taken by the subscriber.
    expect(insights.body.occupancyPct).toBe(60);

    const free = await liveHostel(ownerToken, adminToken, { name: 'Free Listing' });
    await call(`/hostels/${free.hostel.slug}/view`, { method: 'POST' });
    const locked = await call(`/owner/hostels/${free.hostel.id}/insights`, { token: ownerToken });
    expect(locked.body).toMatchObject({ locked: true, views30d: null, viewsByDay: null });

    const otherOwner = await newOwner();
    expect((await call(`/owner/hostels/${hostel.id}/insights`, { token: otherOwner })).status).toBe(404);
  });
});

describe('admin escalations', () => {
  test('unacknowledged after 48h, then unresolved after 7 days; acknowledging clears the first', async () => {
    const a = await newTenant('Anil Kumar');
    await activeSubscriber(a.token, hostel.id, room.id);
    const issue = await call(`/hostels/${hostel.id}/issues`, { token: a.token, body: { category: 'water', title: 'No hot water', description: 'Since Monday' } });
    expect(issue.status).toBe(201);

    expect((await call('/admin/issues/escalated', { token: adminToken })).body).toEqual([]);

    setClock('2026-11-11T07:00:00Z'); // 49 hours later
    const first = await call('/admin/issues/escalated', { token: adminToken });
    expect(first.body).toHaveLength(1);
    expect(first.body[0]).toMatchObject({ id: issue.body.id, reason: 'unacknowledged', ageHours: 49, hostelSlug: hostel.slug });
    expect((await call('/admin/stats', { token: adminToken })).body.escalatedIssues).toBe(1);

    await call(`/issues/${issue.body.id}/updates`, { token: ownerToken, body: { status: 'acknowledged', message: 'Plumber booked' } });
    expect((await call('/admin/issues/escalated', { token: adminToken })).body).toEqual([]);

    setClock('2026-11-17T06:00:01Z'); // just over 7 days
    const late = await call('/admin/issues/escalated', { token: adminToken });
    expect(late.body[0]).toMatchObject({ reason: 'unresolved', status: 'acknowledged' });

    expect((await call('/admin/issues/escalated', { token: ownerToken })).status).toBe(403);
  });
});

describe('admin revenue', () => {
  test('subscription gross, platform fees, and owner plans once the trial ends', async () => {
    const t = await newTenant('Asha');
    await activeSubscriber(t.token, hostel.id, room.id, 'full');
    const now = (await call('/admin/stats', { token: adminToken })).body.revenue;
    // ₹10,000 rent + ₹6,000 full food plan; 10% platform fee. The partner plan is in its free month.
    expect(now).toEqual({ subscriptionGross: 16000, platformFees: 1600, ownerPlans: 0, trialHostels: 1 });

    setClock('2026-12-10T06:00:00Z');
    const later = (await call('/admin/stats', { token: adminToken })).body.revenue;
    expect(later).toMatchObject({ ownerPlans: 1999, trialHostels: 0 });
  });
});
