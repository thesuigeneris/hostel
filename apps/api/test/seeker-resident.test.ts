import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

let ownerToken: string;
let adminToken: string;

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
});

afterEach(() => setClock(null));

const REVIEW = { rating: 4, cleanliness: 5, food: 4, safety: 5, responsiveness: 3, body: 'Clean rooms, fast WiFi, owner fixes issues quickly.' };

describe('my residencies', () => {
  test('say why a stay cannot be reviewed yet, and carry my review for editing', async () => {
    const { hostel, rooms } = await liveHostel(ownerToken, adminToken, { partner: true, foodAvailable: false });
    const t = await newTenant('Asha Rao');
    await activeSubscriber(t.token, hostel.id, rooms[0].id, 'none');

    const early = (await call('/me/residencies', { token: t.token })).body[0];
    expect(early).toMatchObject({ canReview: false, hasReview: false, review: null, hostel: { id: hostel.id, foodAvailable: false } });
    expect(early.reviewBlockedReason).toContain('14 days');

    setClock('2026-11-23T06:00:00Z');
    const ready = (await call('/me/residencies', { token: t.token })).body[0];
    expect(ready).toMatchObject({ canReview: true, reviewBlockedReason: null });

    const posted = await call(`/hostels/${hostel.id}/review`, { token: t.token, method: 'PUT', body: REVIEW });
    expect(posted.status).toBe(200);
    // Food is dropped for a hostel that serves none.
    expect(posted.body.food).toBeNull();

    const mine = (await call('/me/residencies', { token: t.token })).body[0];
    expect(mine.hasReview).toBe(true);
    expect(mine.review).toMatchObject({ id: posted.body.id, rating: 4, body: REVIEW.body, hidden: false, hiddenReason: null });

    // A hidden review stays visible to its author, with the reason.
    await call(`/admin/reviews/${posted.body.id}/hide`, { token: adminToken, body: { reason: 'Personal data' } });
    const hidden = (await call('/me/residencies', { token: t.token })).body[0];
    expect(hidden.review).toMatchObject({ hidden: true, hiddenReason: 'Personal data' });

    // Other users never see someone else's review through this endpoint.
    const other = await newTenant('Other');
    expect((await call('/me/residencies', { token: other.token })).body).toEqual([]);
  });
});

describe('visit requests', () => {
  test('a seeker can withdraw a request the hostel has not answered', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken);
    const seeker = await newTenant('Seeker');
    const stranger = await newTenant('Stranger');
    const v = await call(`/hostels/${hostel.id}/visits`, { token: seeker.token, body: { preferredDate: '2026-11-12' } });
    expect(v.status).toBe(201);

    expect((await call(`/me/visits/${v.body.id}`, { token: stranger.token, method: 'DELETE' })).status).toBe(404);
    expect((await call(`/me/visits/${v.body.id}`, { method: 'DELETE' })).status).toBe(401);

    const cancelled = await call(`/me/visits/${v.body.id}`, { token: seeker.token, method: 'DELETE' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('closed');
    expect((await call(`/me/visits/${v.body.id}`, { token: seeker.token, method: 'DELETE' })).body.error).toBe('invalid_state');

    // Withdrawing frees the slot for a new request; one the owner answered can no longer be withdrawn.
    const again = await call(`/hostels/${hostel.id}/visits`, { token: seeker.token, body: { preferredDate: '2026-11-13' } });
    expect(again.status).toBe(201);
    await call(`/owner/visits/${again.body.id}`, { token: ownerToken, method: 'PATCH', body: { status: 'contacted' } });
    expect((await call(`/me/visits/${again.body.id}`, { token: seeker.token, method: 'DELETE' })).body.error).toBe('invalid_state');
  });
});
