import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { newId } from '@hostels/shared';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, nextPhone } from './fixtures';
import { call, resetDb } from './helpers';

// Owner persona: answering residents. Edge cases I1 (needs response), O1 and O2 (review replies), and editing a reply.

let ownerToken: string;
let adminToken: string;
let hostel: { id: string; slug: string };
let room: { id: string };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true });
  hostel = h.hostel;
  room = h.rooms[0];
});

afterEach(() => setClock(null));

const at = (iso: string) => setClock(iso);
const ownerView = async (issueId: string) =>
  (await call('/owner/issues', { token: ownerToken })).body.find((i: { id: string }) => i.id === issueId) as { needsResponse: boolean; awaitingReplySince: string | null };
const dashboardCount = async () => (await call(`/owner/hostels/${hostel.id}/insights`, { token: ownerToken })).body.issues.needsResponse as number;
const badge = async () => (await call('/owner/issues/summary', { token: ownerToken })).body as { needsResponse: number; byHostel: Record<string, number> };

async function reportedIssue() {
  const t = await newTenant('Anil Kumar');
  await activeSubscriber(t.token, hostel.id, room.id);
  const issue = await call(`/hostels/${hostel.id}/issues`, { token: t.token, body: { category: 'water', title: 'No hot water', description: 'Since Monday' } });
  expect(issue.status).toBe(201);
  return { tenant: t, issueId: issue.body.id as string };
}

describe('needs response (I1): one rule for the issue list, the dashboard and the tab badge', () => {
  test('waits 24 hours from the report; an owner comment alone answers it', async () => {
    const { issueId } = await reportedIssue();
    // Exactly 24 hours is still within the window; a minute later it needs a response.
    at('2026-11-10T06:00:00Z');
    expect((await ownerView(issueId)).needsResponse).toBe(false);
    at('2026-11-10T06:01:00Z');
    expect(await ownerView(issueId)).toMatchObject({ needsResponse: true, awaitingReplySince: '2026-11-09T06:00:00.000Z' });
    expect(await dashboardCount()).toBe(1);
    expect(await badge()).toEqual({ needsResponse: 1, byHostel: { [hostel.id]: 1 } });

    // The owner answers with a comment only: the issue stays open, but it has been answered.
    const reply = await call(`/issues/${issueId}/updates`, { token: ownerToken, body: { message: 'Plumber booked for 4 pm' } });
    expect(reply.body.status).toBe('open');
    at('2026-11-12T06:00:00Z');
    expect(await ownerView(issueId)).toMatchObject({ needsResponse: false, awaitingReplySince: null });
    expect(await dashboardCount()).toBe(0);
    expect(await badge()).toEqual({ needsResponse: 0, byHostel: {} });
  });

  test('a reopened issue needs a response again, timed from the reopen', async () => {
    const { tenant, issueId } = await reportedIssue();
    at('2026-11-09T08:00:00Z');
    await call(`/issues/${issueId}/updates`, { token: ownerToken, body: { status: 'resolved', message: 'Geyser replaced' } });
    at('2026-11-11T06:00:00Z');
    const reopened = await call(`/issues/${issueId}/updates`, { token: tenant.token, body: { status: 'open', message: 'Cold again' } });
    expect(reopened.body.status).toBe('open');

    // 23 hours after the reopen (but days after the report): not yet overdue.
    at('2026-11-12T05:00:00Z');
    expect(await ownerView(issueId)).toMatchObject({ needsResponse: false, awaitingReplySince: '2026-11-11T06:00:00.000Z' });
    expect(await dashboardCount()).toBe(0);
    // 25 hours after the reopen: overdue, even though the owner answered before it.
    at('2026-11-12T07:00:00Z');
    expect((await ownerView(issueId)).needsResponse).toBe(true);
    expect(await dashboardCount()).toBe(1);
    expect((await badge()).needsResponse).toBe(1);

    // Answering after the reopen clears it.
    await call(`/issues/${issueId}/updates`, { token: ownerToken, body: { message: 'Sending the plumber back today' } });
    expect((await ownerView(issueId)).needsResponse).toBe(false);
    expect(await dashboardCount()).toBe(0);
    expect((await badge()).needsResponse).toBe(0);
  });

  test("the badge counts only the caller's hostels", async () => {
    await reportedIssue();
    at('2026-11-11T06:00:00Z');
    const other = await newOwner();
    expect((await call('/owner/issues/summary', { token: other })).body).toEqual({ needsResponse: 0, byHostel: {} });
    expect((await badge()).needsResponse).toBe(1);
  });
});

/** Writes reviews straight to the database, one day apart, newest first; returns their ids oldest last. */
async function seedReviews(hostelId: string, count: number) {
  const db = getDb();
  const ids: string[] = [];
  for (let n = 0; n < count; n++) {
    const userId = newId('usr');
    const phone = nextPhone();
    await db.insert(schema.users).values({ id: userId, phone, name: `Reviewer ${n}` });
    const residencyId = newId('res');
    await db
      .insert(schema.residencies)
      .values({ id: residencyId, userId, phone, hostelId, source: 'owner', startDate: '2026-06-01', endDate: '2026-09-30', status: 'ended' });
    const id = newId('rev');
    const when = new Date(Date.parse('2026-11-01T06:00:00Z') - n * 86_400_000);
    await db.insert(schema.reviews).values({
      id,
      hostelId,
      userId,
      residencyId,
      rating: 4,
      cleanliness: 4,
      safety: 4,
      responsiveness: 4,
      body: `Review number ${n}, long enough to count.`,
      createdAt: when,
      updatedAt: when,
    });
    ids.push(id);
  }
  return ids;
}

describe('review replies (O1, O2) and editing a reply', () => {
  test('replying to a review older than the newest 20 saves and returns that review (O1)', async () => {
    const ids = await seedReviews(hostel.id, 22);
    const oldest = ids[21]!;
    const res = await call(`/owner/reviews/${oldest}/reply`, { token: ownerToken, body: { reply: 'Thank you for staying with us.' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: oldest, ownerReply: 'Thank you for staying with us.', ownerReplyEditedAt: null });
    // The owner's list puts reviews still waiting for a reply first, and pages through the rest.
    const first = (await call(`/owner/hostels/${hostel.id}/reviews`, { token: ownerToken })).body as { id: string }[];
    expect(first).toHaveLength(20);
    expect(first.map((r) => r.id)).not.toContain(oldest);
    const second = (await call(`/owner/hostels/${hostel.id}/reviews?page=2`, { token: ownerToken })).body as { id: string }[];
    expect(second.map((r) => r.id)).toEqual([ids[20], oldest]);
  });

  test('a double tap posts one reply; the second is told it already replied (O2)', async () => {
    const ids = await seedReviews(hostel.id, 4);
    for (const id of ids) {
      const results = await Promise.all(
        ['First reply', 'Second reply'].map((reply) => call(`/owner/reviews/${id}/reply`, { token: ownerToken, body: { reply } })),
      );
      const ok = results.filter((r) => r.status === 200);
      expect(ok).toHaveLength(1);
      const loser = results.find((r) => r.status !== 200)!;
      expect(loser.status).toBe(409);
      expect(loser.body).toMatchObject({ error: 'invalid_state', message: expect.stringContaining('already replied') });
      const [row] = await getDb().select().from(schema.reviews).where(eq(schema.reviews.id, id));
      expect(row!.ownerReply).toBe(ok[0]!.body.ownerReply);
    }
  });

  test('the owner can edit a reply, which then shows as edited with the date; the same words change nothing', async () => {
    const [id] = await seedReviews(hostel.id, 1);
    expect((await call(`/owner/reviews/${id}/reply`, { token: ownerToken, method: 'PUT', body: { reply: 'Nothing yet' } })).status).toBe(409);
    at('2026-11-09T07:00:00Z');
    await call(`/owner/reviews/${id}/reply`, { token: ownerToken, body: { reply: 'Thanks for the review!' } });
    at('2026-11-10T07:00:00Z');
    const same = await call(`/owner/reviews/${id}/reply`, { token: ownerToken, method: 'PUT', body: { reply: 'Thanks for the review!' } });
    expect(same.body.ownerReplyEditedAt).toBeNull();
    at('2026-11-11T07:00:00Z');
    const edited = await call(`/owner/reviews/${id}/reply`, { token: ownerToken, method: 'PUT', body: { reply: 'Thanks! The WiFi is fixed now.' } });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      ownerReply: 'Thanks! The WiFi is fixed now.',
      ownerRepliedAt: '2026-11-09T07:00:00.000Z',
      ownerReplyEditedAt: '2026-11-11T07:00:00.000Z',
    });
    // Seekers see the same on the public page.
    const pub = (await call(`/hostels/${hostel.slug}/reviews`)).body as { id: string; ownerReplyEditedAt: string | null }[];
    expect(pub.find((r) => r.id === id)?.ownerReplyEditedAt).toBe('2026-11-11T07:00:00.000Z');
  });

  test('replies need Pro or Partner, and only the owner of the hostel can reply', async () => {
    const free = await liveHostel(ownerToken, adminToken);
    const [onFree] = await seedReviews(free.hostel.id, 1);
    const refused = await call(`/owner/reviews/${onFree}/reply`, { token: ownerToken, body: { reply: 'Thanks!' } });
    expect(refused.status).toBe(402);
    expect(refused.body.error).toBe('plan_required');
    const [mine] = await seedReviews(hostel.id, 1);
    const stranger = await newOwner();
    expect((await call(`/owner/reviews/${mine}/reply`, { token: stranger, body: { reply: 'Hi' } })).status).toBe(404);
    expect((await call(`/owner/reviews/${mine}/reply`, { token: stranger, method: 'PUT', body: { reply: 'Hi' } })).status).toBe(404);
  });
});
