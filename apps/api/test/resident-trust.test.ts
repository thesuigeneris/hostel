import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { reviewEdits } from '@hostels/shared';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, nextPhone } from './fixtures';
import { call, login, resetDb } from './helpers';

/**
 * Resident trust rows from docs/product/edge-cases.md: T1 (backdated owner-added stays), T3 (edits after a reply),
 * T4 (hidden reviews stay hidden), T7 (review window boundaries), T9 (answering an invite or moving out twice at once),
 * T11 (how names show).
 */

let ownerToken: string;
let adminToken: string;
let pro: { hostel: { id: string; slug: string }; rooms: { id: string }[] };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z'); // Monday, 11:30 IST
  ownerToken = await newOwner();
  adminToken = await admin();
  pro = await liveHostel(ownerToken, adminToken);
  expect((await call(`/owner/hostels/${pro.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } })).status).toBe(200);
});

afterEach(() => setClock(null));

const REVIEW = { rating: 4, cleanliness: 5, food: 4, safety: 5, responsiveness: 3, body: 'Clean rooms, fast WiFi, owner fixes issues quickly.' };

type Stay = { id: string; status: string; canReview: boolean; reviewBlockedReason: string | null; startDate: string; endDate: string | null };

/** The owner adds a phone to the roster; that person signs in and sees the invite. */
async function invite(startDate: string, name = 'Ravi Kumar') {
  const phone = nextPhone();
  const added = await call(`/owner/hostels/${pro.hostel.id}/residents`, { token: ownerToken, body: { phone, name, monthlyRent: 7000, startDate } });
  expect(added.status).toBe(201);
  const token = await login(phone);
  await call('/me', { token, method: 'PATCH', body: { name } });
  const stays = (await call('/me/residencies', { token })).body as Stay[];
  return { token, phone, residencyId: stays[0]!.id };
}

async function stayOf(token: string, residencyId: string) {
  return ((await call('/me/residencies', { token })).body as Stay[]).find((s) => s.id === residencyId)!;
}

const review = (token: string, hostelId = pro.hostel.id, body = REVIEW) => call(`/hostels/${hostelId}/review`, { token, method: 'PUT', body });

describe('T1: an owner-added stay counts toward a review from the day the hostel added the person', () => {
  test('a start date months in the past does not make the resident eligible on day one', async () => {
    const r = await invite('2026-08-01');
    expect((await call(`/me/residencies/${r.residencyId}/accept`, { token: r.token, method: 'POST' })).status).toBe(200);

    const today = await stayOf(r.token, r.residencyId);
    expect(today.canReview).toBe(false);
    expect(today.reviewBlockedReason).toBe('You can review after 14 days here, counted from 9 Nov 2026 when the hostel added you (14 days to go)');
    const refused = await review(r.token);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: 'review_not_allowed', message: today.reviewBlockedReason });

    setClock('2026-11-22T06:00:00Z'); // day 13 after being added
    expect((await stayOf(r.token, r.residencyId)).reviewBlockedReason).toContain('(1 day to go)');
    expect((await review(r.token)).status).toBe(403);

    setClock('2026-11-23T06:00:00Z'); // day 14
    expect((await stayOf(r.token, r.residencyId)).canReview).toBe(true);
    const posted = await review(r.token);
    expect(posted.status).toBe(200);
    // The stay span on the review stays as the hostel recorded it.
    expect(posted.body).toMatchObject({ verifiedVia: 'owner', stay: { from: '2026-08-01', to: null } });
  });

  test('a stay the owner ends on the day they add it is too short, however far back it claims to start', async () => {
    const r = await invite('2026-06-01');
    await call(`/me/residencies/${r.residencyId}/accept`, { token: r.token, method: 'POST' });
    const ended = await call(`/owner/hostels/${pro.hostel.id}/residents/${r.residencyId}/end`, { token: ownerToken, body: { endDate: '2026-11-09' } });
    expect(ended.body.status).toBe('ended');
    const stay = await stayOf(r.token, r.residencyId);
    expect(stay.canReview).toBe(false);
    expect(stay.reviewBlockedReason).toBe('Your stay was too short to review: reviews need 14 days, counted from 9 Nov 2026 when the hostel added you');
    expect((await review(r.token)).status).toBe(403);
  });

  test('a start date after the day the owner added them counts from the start date; subscribers count from their start', async () => {
    const r = await invite('2026-11-12');
    await call(`/me/residencies/${r.residencyId}/accept`, { token: r.token, method: 'POST' });
    expect((await stayOf(r.token, r.residencyId)).reviewBlockedReason).toBe('You can review after 14 days here (17 days to go)');
    setClock('2026-11-26T06:00:00Z');
    expect((await stayOf(r.token, r.residencyId)).canReview).toBe(true);

    const partner = await liveHostel(ownerToken, adminToken, { partner: true });
    setClock('2026-11-09T06:00:00Z');
    const t = await newTenant('Asha Rao');
    await activeSubscriber(t.token, partner.hostel.id, partner.rooms[0]!.id);
    const sub = ((await call('/me/residencies', { token: t.token })).body as Stay[])[0]!;
    expect(sub.reviewBlockedReason).toBe('You can review after 14 days here (14 days to go)');
  });
});

describe('T7: review window boundaries', () => {
  test('day 13 of an active stay is refused with the days to go; day 14 is allowed', async () => {
    const partner = await liveHostel(ownerToken, adminToken, { partner: true });
    const t = await newTenant('Asha Rao');
    await activeSubscriber(t.token, partner.hostel.id, partner.rooms[0]!.id);
    setClock('2026-11-22T18:29:00Z'); // 23:59 IST on day 13
    const day13 = await review(t.token, partner.hostel.id);
    expect(day13.status).toBe(403);
    expect(day13.body.message).toBe('You can review after 14 days here (1 day to go)');
    setClock('2026-11-22T18:30:00Z'); // 00:00 IST on day 14
    expect((await review(t.token, partner.hostel.id)).status).toBe(200);
  });

  test('a 13-day stay can never review; a 14-day stay can, for 180 days after moving out and not on day 181', async () => {
    const short = await invite('2026-11-09', 'Short Stay');
    const long = await invite('2026-11-09', 'Long Stay');
    for (const r of [short, long]) await call(`/me/residencies/${r.residencyId}/accept`, { token: r.token, method: 'POST' });
    setClock('2026-11-22T06:00:00Z');
    // 9 to 21 November is 13 days; 9 to 22 November is 14.
    await call(`/owner/hostels/${pro.hostel.id}/residents/${short.residencyId}/end`, { token: ownerToken, body: { endDate: '2026-11-21' } });
    await call(`/owner/hostels/${pro.hostel.id}/residents/${long.residencyId}/end`, { token: ownerToken, body: { endDate: '2026-11-22' } });

    expect((await stayOf(short.token, short.residencyId)).reviewBlockedReason).toBe('Your stay was too short to review: reviews need 14 days');
    expect((await review(short.token)).status).toBe(403);
    expect((await stayOf(long.token, long.residencyId)).canReview).toBe(true);

    setClock('2027-05-21T06:00:00Z'); // 180 days after 22 November
    expect((await stayOf(long.token, long.residencyId)).canReview).toBe(true);
    expect((await stayOf(short.token, short.residencyId)).canReview).toBe(false);
    setClock('2027-05-22T06:00:00Z'); // day 181
    const late = await stayOf(long.token, long.residencyId);
    expect(late).toMatchObject({ canReview: false, reviewBlockedReason: 'Reviews are open for 180 days after you move out' });
    expect((await review(long.token)).status).toBe(403);
  });
});

describe('T3 and T4: editing a review', () => {
  test('an edit after the owner replied is labelled; an edit before it is not', async () => {
    const partner = await liveHostel(ownerToken, adminToken, { partner: true });
    const t = await newTenant('Asha Rao');
    await activeSubscriber(t.token, partner.hostel.id, partner.rooms[0]!.id);
    setClock('2026-11-23T06:00:00Z');
    const first = await review(t.token, partner.hostel.id);
    setClock('2026-11-24T06:00:00Z');
    const editedBefore = await review(t.token, partner.hostel.id, { ...REVIEW, rating: 3 });
    expect(reviewEdits(editedBefore.body)).toEqual({ edited: true, editedAfterReply: false });

    setClock('2026-11-25T06:00:00Z');
    await call(`/owner/reviews/${first.body.id}/reply`, { token: ownerToken, body: { reply: 'Sorry about the WiFi, fixed now.' } });
    const replied = (await call(`/hostels/${partner.hostel.slug}/reviews`)).body[0];
    expect(reviewEdits(replied)).toEqual({ edited: true, editedAfterReply: false });

    setClock('2026-11-26T06:00:00Z');
    await review(t.token, partner.hostel.id, { ...REVIEW, rating: 2, body: 'WiFi came back but the water is cold again in the mornings.' });
    const card = (await call(`/hostels/${partner.hostel.slug}/reviews`)).body[0];
    expect(card).toMatchObject({ rating: 2, ownerReply: 'Sorry about the WiFi, fixed now.', createdAt: '2026-11-23T06:00:00.000Z' });
    expect(card.updatedAt > card.ownerRepliedAt).toBe(true);
    expect(reviewEdits(card)).toEqual({ edited: true, editedAfterReply: true });
  });

  test('a hidden review stays hidden when its author edits it', async () => {
    const partner = await liveHostel(ownerToken, adminToken, { partner: true });
    const t = await newTenant('Asha Rao');
    await activeSubscriber(t.token, partner.hostel.id, partner.rooms[0]!.id);
    setClock('2026-11-23T06:00:00Z');
    const posted = await review(t.token, partner.hostel.id);
    await call(`/admin/reviews/${posted.body.id}/hide`, { token: adminToken, body: { reason: 'Personal data' } });

    const edited = await review(t.token, partner.hostel.id, { ...REVIEW, body: 'Edited to remove the warden’s phone number, sorry.' });
    expect(edited.status).toBe(200);
    expect(edited.body.hidden).toBe(true);
    expect((await call(`/hostels/${partner.hostel.slug}/reviews`)).body).toHaveLength(0);
    expect((await call(`/hostels/${partner.hostel.slug}`)).body.ratings.reviewCount).toBe(0);
    const mine = (await call('/me/residencies', { token: t.token })).body[0];
    expect(mine.review).toMatchObject({ hidden: true, hiddenReason: 'Personal data', body: 'Edited to remove the warden’s phone number, sorry.' });
  });
});

describe('T9: an invite or a move-out answered twice at once', () => {
  test('accepting and declining together: one answer wins, the rest are told it was already answered', async () => {
    const r = await invite('2026-11-09');
    const path = (a: string) => `/me/residencies/${r.residencyId}/${a}`;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, k) => call(path(k % 2 ? 'decline' : 'accept'), { token: r.token, method: 'POST' })),
    );
    const won = results.filter((x) => x.status === 200);
    expect(won).toHaveLength(1);
    for (const lost of results.filter((x) => x.status !== 200)) {
      expect(lost.status).toBe(409);
      expect(lost.body.message).toContain('already answered');
    }
    expect((await stayOf(r.token, r.residencyId)).status).toBe(won[0]!.body.status);
    // Answering again later is refused the same way, and another person's invite stays invisible.
    expect((await call(path('accept'), { token: r.token, method: 'POST' })).status).toBe(409);
    const other = await newTenant();
    expect((await call(path('decline'), { token: other.token, method: 'POST' })).status).toBe(404);
  });

  test('moving out twice at once ends the stay once; the second is told it is not active', async () => {
    const r = await invite('2026-11-09');
    await call(`/me/residencies/${r.residencyId}/accept`, { token: r.token, method: 'POST' });
    setClock('2026-11-30T06:00:00Z');
    const results = await Promise.all(Array.from({ length: 8 }, () => call(`/me/residencies/${r.residencyId}/move-out`, { token: r.token, method: 'POST' })));
    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
    for (const lost of results.filter((x) => x.status !== 200)) {
      expect(lost.status).toBe(409);
      expect(lost.body.message).toContain('not active');
    }
    expect(await stayOf(r.token, r.residencyId)).toMatchObject({ status: 'ended', endDate: '2026-11-30' });
  });

  test('subscribers leave by cancelling or moving their plan, not by moving out', async () => {
    const partner = await liveHostel(ownerToken, adminToken, { partner: true });
    const t = await newTenant();
    await activeSubscriber(t.token, partner.hostel.id, partner.rooms[0]!.id);
    const stay = (await call('/me/residencies', { token: t.token })).body[0];
    const res = await call(`/me/residencies/${stay.id}/move-out`, { token: t.token, method: 'POST' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cancel or move your plan to leave this hostel');
  });
});

describe('T11: names on reviews and in the neighbour list', () => {
  test('Devanagari, a single word and no name all show sensibly; a phone number typed as a name never shows', async () => {
    const partner = await liveHostel(ownerToken, adminToken, { partner: true, rooms: [{ sharing: '3-sharing', monthlyRent: 8000, totalBeds: 12, bedsAvailable: 10 }] });
    const people = [
      ['राहुल शर्मा', 'राहुल श.'],
      ['Asha', 'Asha'],
      ['', 'Resident'],
      ['98765 43210', 'Resident'],
      ['  Meera   Pillai  ', 'Meera P.'],
    ] as const;
    const authors: string[] = [];
    for (const [name] of people) {
      const t = await newTenant(name);
      setClock('2026-11-09T06:00:00Z');
      await activeSubscriber(t.token, partner.hostel.id, partner.rooms[0]!.id);
      const stay = (await call('/me/residencies', { token: t.token })).body[0];
      await call(`/me/residencies/${stay.id}`, { token: t.token, method: 'PATCH', body: { directoryOptIn: true } });
      setClock('2026-11-23T06:00:00Z');
      const res = await review(t.token, partner.hostel.id);
      expect(res.status).toBe(200);
      authors.push(res.body.author);
    }
    expect(authors).toEqual(people.map(([, shown]) => shown));
    const t = await newTenant('Viewer');
    await activeSubscriber(t.token, partner.hostel.id, partner.rooms[0]!.id);
    const dir = (await call(`/hostels/${partner.hostel.id}/directory`, { token: t.token })).body as { name: string }[];
    expect(dir.map((d) => d.name).sort()).toEqual([...people.map(([, shown]) => shown)].sort());
    expect(JSON.stringify(dir)).not.toContain('98765');
  });
});
