import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PARTNER_STANDARD_IDS } from '@hostels/shared';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';
import { holdRow } from './latch';

let ownerToken: string;
let adminToken: string;

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  ownerToken = await newOwner();
  adminToken = await admin();
});

afterEach(() => setClock(null));

const REVIEW = { rating: 2, cleanliness: 2, food: 2, safety: 3, responsiveness: 1, body: 'Water ran out most mornings and nobody came to fix it.' };

async function reviewedHostel() {
  const { hostel, rooms } = await liveHostel(ownerToken, adminToken, { partner: true });
  const author = await newTenant('Asha Rao');
  await activeSubscriber(author.token, hostel.id, rooms[0].id);
  setClock('2026-11-24T06:00:00Z');
  const review = await call(`/hostels/${hostel.id}/review`, { token: author.token, method: 'PUT', body: REVIEW });
  expect(review.status).toBe(200);
  return { hostel, rooms, review: review.body as { id: string } };
}

const auditOf = async (action: string) =>
  (await call(`/admin/audit?action=${action}`, { token: adminToken })).body as { action: string; targetId: string; summary: string; actor: { id: string } | null }[];

describe('review flags', () => {
  test('the same person can flag a review again once an admin has acted on the earlier flag', async () => {
    const { review } = await reviewedHostel();
    const reader = await newTenant('Ravi Kumar');
    const flag = () => call(`/reviews/${review.id}/flag`, { token: reader.token, body: { reason: 'Looks fake or not a real stay' } });

    expect((await flag()).status).toBe(200);
    expect((await flag()).status).toBe(200); // twice while open: still one flag
    let queue = (await call('/admin/reviews/flagged', { token: adminToken })).body;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ flags: 1, reasons: ['Looks fake or not a real stay'], review: { id: review.id, author: 'Asha R.', hidden: false } });

    expect((await call(`/admin/reviews/${review.id}/hide`, { token: adminToken, body: { reason: 'Shares personal details' } })).status).toBe(200);
    expect((await call('/admin/reviews/flagged', { token: adminToken })).body).toHaveLength(0);
    const hidden = (await call('/admin/reviews/hidden', { token: adminToken })).body;
    expect(hidden[0]).toMatchObject({ review: { id: review.id, hiddenReason: 'Shares personal details' } });

    // Shown again; the reader still thinks it is wrong and says so. Before, the old (resolved) flag blocked this
    // silently: the request answered ok and nothing reached the queue.
    expect((await call(`/admin/reviews/${review.id}/unhide`, { token: adminToken, method: 'POST' })).status).toBe(200);
    expect((await flag()).status).toBe(200);
    queue = (await call('/admin/reviews/flagged', { token: adminToken })).body;
    expect(queue).toHaveLength(1);
    expect(queue[0].flags).toBe(1);

    // Keeping it dismisses the flag with a reason, on the record.
    const kept = await call(`/admin/reviews/${review.id}/keep`, { token: adminToken, body: { reason: 'A bad rating is not a reason to hide' } });
    expect(kept.body).toMatchObject({ dismissed: 1 });
    expect((await call('/admin/reviews/flagged', { token: adminToken })).body).toHaveLength(0);
    expect((await auditOf('review.keep'))[0]!.summary).toContain('A bad rating is not a reason to hide');
  });

  test('reviews of a hostel that is no longer public cannot be flagged', async () => {
    const { hostel, review } = await reviewedHostel();
    const reader = await newTenant();
    await getDb().update(schema.hostels).set({ status: 'draft' }).where(eq(schema.hostels.id, hostel.id));
    const res = await call(`/reviews/${review.id}/flag`, { token: reader.token, body: { reason: 'Off-topic or spam' } });
    expect(res.status).toBe(404);
    expect((await call('/admin/reviews/flagged', { token: adminToken })).body).toHaveLength(0);
  });
});

describe('content reports', () => {
  test('admins hide, show again or keep a reported post, with a reason; the same person may report again later', async () => {
    const { hostel, rooms } = await liveHostel(ownerToken, adminToken, { partner: true });
    const author = await newTenant('Meena Iyer');
    const neighbour = await newTenant('Kiran');
    await activeSubscriber(author.token, hostel.id, rooms[0].id);
    await activeSubscriber(neighbour.token, hostel.id, rooms[0].id);
    const post = await call(`/hostels/${hostel.id}/community`, { token: author.token, body: { kind: 'buy_sell', body: 'Selling a cycle, call 98480 12345' } });
    expect(post.status).toBe(201);
    const report = () => call(`/posts/${post.body.id}/report`, { token: neighbour.token, body: { reason: 'Shares a phone number' } });
    expect((await report()).status).toBe(200);

    let queue = (await call('/admin/reports', { token: adminToken })).body;
    expect(queue).toEqual([
      expect.objectContaining({ targetType: 'post', targetId: post.body.id, reports: 1, reasons: ['Shares a phone number'], content: expect.objectContaining({ author: 'Meena', hidden: false }) }),
    ]);

    // Hiding needs a reason.
    expect((await call(`/admin/content/post/${post.body.id}/hide`, { token: adminToken, method: 'POST' })).status).toBe(400);
    expect((await call(`/admin/content/post/${post.body.id}/hide`, { token: adminToken, body: { reason: 'Shares personal details' } })).status).toBe(200);
    expect((await call(`/hostels/${hostel.id}/community`, { token: neighbour.token })).body.map((p: { id: string }) => p.id)).not.toContain(post.body.id);
    expect((await call('/admin/reports', { token: adminToken })).body).toHaveLength(0);
    expect((await call('/admin/content/hidden', { token: adminToken })).body[0]).toMatchObject({ targetId: post.body.id, hostelName: hostel.name });
    expect((await auditOf('content.hide'))[0]!.summary).toBe('Post hidden: Shares personal details');

    expect((await call(`/admin/content/post/${post.body.id}/unhide`, { token: adminToken, method: 'POST' })).status).toBe(200);
    expect((await call(`/hostels/${hostel.id}/community`, { token: neighbour.token })).body.map((p: { id: string }) => p.id)).toContain(post.body.id);

    // A fresh report after the decision reaches the queue; keeping the post clears it and leaves the post up.
    expect((await report()).status).toBe(200);
    queue = (await call('/admin/reports', { token: adminToken })).body;
    expect(queue).toHaveLength(1);
    expect((await call(`/admin/content/post/${post.body.id}/keep`, { token: adminToken, body: { reason: 'The seller asked for calls' } })).body.resolved).toBe(1);
    expect((await call('/admin/reports', { token: adminToken })).body).toHaveLength(0);
    expect((await call(`/hostels/${hostel.id}/community`, { token: neighbour.token })).body.map((p: { id: string }) => p.id)).toContain(post.body.id);

    // Reported comments work the same way; reports on content its author deleted can still be cleared.
    const comment = await call(`/posts/${post.body.id}/comments`, { token: author.token, body: { body: 'Still available' } });
    await call(`/comments/${comment.body.id}/report`, { token: neighbour.token, body: { reason: 'Spam' } });
    await call(`/comments/${comment.body.id}`, { token: author.token, method: 'DELETE' });
    queue = (await call('/admin/reports', { token: adminToken })).body;
    expect(queue).toEqual([expect.objectContaining({ targetType: 'comment', content: null })]);
    expect((await call(`/admin/content/comment/${comment.body.id}/keep`, { token: adminToken, body: { reason: 'Deleted by its author' } })).status).toBe(200);
    expect((await call('/admin/reports', { token: adminToken })).body).toHaveLength(0);
  });
});

describe('recently changed listings (edge case O3)', () => {
  test('material edits of live listings are recorded with before and after; other edits and drafts are not', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, { name: 'Green Nest PG' });
    const edit = (body: object, token = ownerToken) => call(`/owner/hostels/${hostel.id}`, { token, method: 'PATCH', body });
    expect((await edit({ description: 'Now with a terrace garden' })).status).toBe(200);
    expect((await call('/admin/listing-changes', { token: adminToken })).body).toHaveLength(0);

    setClock('2026-11-10T09:30:00Z');
    expect((await edit({ name: 'Green Nest Residency', contactPhone: '9876500009', description: 'Renamed' })).status).toBe(200);
    const [change] = (await call('/admin/listing-changes', { token: adminToken })).body;
    expect(change).toMatchObject({
      hostel: { id: hostel.id, name: 'Green Nest Residency', partnerStatus: 'none', recheckSince: null },
      changedBy: { isOwner: true },
      partnerRecheck: false,
      createdAt: '2026-11-10T09:30:00.000Z',
    });
    expect(change.changes).toEqual([
      { field: 'name', label: 'Name', before: 'Green Nest PG', after: 'Green Nest Residency' },
      { field: 'contactPhone', label: 'Contact phone', before: '9876500000', after: '9876500009' },
    ]);
    // A listing that isn't live yet is read in full at approval, so its edits leave no trail.
    const draft = await call('/owner/hostels', {
      token: ownerToken,
      body: { name: 'Draft Den', area: 'Kondapur', lat: 17.46, lng: 78.36, genderType: 'girls', contactPhone: '9876500002', amenities: [] },
    });
    await call(`/owner/hostels/${draft.body.id}`, { token: ownerToken, method: 'PATCH', body: { name: 'Draft Den 2' } });
    expect((await call('/admin/listing-changes', { token: adminToken })).body).toHaveLength(1);
  });

  test('a verified partner that moves is flagged for a new check; the badge stays, and seekers are told', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, { partner: true, name: 'Moving House' });
    setClock('2026-11-20T06:00:00Z');
    const moved = await call(`/owner/hostels/${hostel.id}`, { token: ownerToken, method: 'PATCH', body: { address: 'Plot 7, new lane', lat: 17.45 } });
    expect(moved.status).toBe(200);
    expect(moved.body).not.toHaveProperty('partnerRecheckSince');

    const changes = (await call('/admin/listing-changes?recheck=true', { token: adminToken })).body;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ partnerRecheck: true, hostel: { recheckSince: '2026-11-20T06:00:00.000Z' } });
    expect(changes[0].changes.map((c: { field: string }) => c.field)).toEqual(['address', 'lat']);
    const flagged = (await call('/admin/hostels?partnerStatus=verified&recheck=true', { token: adminToken })).body;
    expect(flagged.map((h: { id: string }) => h.id)).toEqual([hostel.id]);
    expect((await call('/admin/stats', { token: adminToken })).body).toMatchObject({ partnerRechecks: 1, listingChanges7d: 1 });

    // Still a verified partner (editing keeps a listing live), but the explainer no longer vouches for the new place.
    const page = (await call(`/hostels/${hostel.slug}`)).body;
    expect(page.isVerified).toBe(true);
    expect(page.partnerCheck).toMatchObject({ checkedOn: '2026-11-09', recheckSince: '2026-11-20' });

    // A second move while the check is pending keeps the first date.
    setClock('2026-11-21T06:00:00Z');
    await call(`/owner/hostels/${hostel.id}`, { token: ownerToken, method: 'PATCH', body: { lng: 78.4 } });
    expect((await call(`/hostels/${hostel.slug}`)).body.partnerCheck.recheckSince).toBe('2026-11-20');

    // The new visit needs the whole checklist again.
    const recheck = (checklist: string[]) =>
      call(`/admin/hostels/${hostel.id}/partner/recheck`, { token: adminToken, body: { checklist, note: 'Visited the new building' } });
    expect((await recheck(PARTNER_STANDARD_IDS.slice(0, 3))).status).toBe(400);
    setClock('2026-11-22T06:00:00Z');
    const done = await recheck([...PARTNER_STANDARD_IDS]);
    expect(done.status).toBe(200);
    expect(done.body.partnerRecheckSince).toBeNull();
    expect((await recheck([...PARTNER_STANDARD_IDS])).status).toBe(409);
    const after = (await call(`/hostels/${hostel.slug}`)).body.partnerCheck;
    expect(after).toEqual({ checkedOn: '2026-11-22', checks: [...PARTNER_STANDARD_IDS] });
    // "Partner since" on the brand kit is the partnership, not the latest visit.
    expect((await call(`/owner/hostels/${hostel.id}/brand-kit`, { token: ownerToken })).body.partnerSince).toBe('2026-11-09');
    expect((await auditOf('partner.recheck'))[0]!.summary).toContain('Visited the new building');
  });

  test('two saves at the same moment are recorded one after the other, each with what it really replaced', async () => {
    const { hostel } = await liveHostel(ownerToken, adminToken, { name: 'Race Lane PG' });
    const latch = await holdRow('hostels', hostel.id);
    const first = call(`/owner/hostels/${hostel.id}`, { token: ownerToken, method: 'PATCH', body: { name: 'Race Lane Residency' } });
    await latch.queued(1);
    const second = call(`/owner/hostels/${hostel.id}`, { token: ownerToken, method: 'PATCH', body: { name: 'Race Lane Rooms' } });
    await latch.queued(2);
    await latch.release();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    // The clock is pinned, so both rows carry the same time; what matters is that they chain.
    const names = ((await call('/admin/listing-changes', { token: adminToken })).body as { changes: { before: string; after: string }[] }[]).map(
      (c) => [c.changes[0]!.before, c.changes[0]!.after],
    );
    expect(names).toHaveLength(2);
    expect(names).toContainEqual(['Race Lane PG', 'Race Lane Residency']);
    expect(names).toContainEqual(['Race Lane Residency', 'Race Lane Rooms']);
  });
});

describe('admins acting in an owner workspace (edge case O7)', () => {
  test('changes are audited with the admin as the actor and the hostel as the target; reads, failures and owners are not', async () => {
    const { hostel, rooms } = await liveHostel(ownerToken, adminToken, { partner: true, name: 'Owner House' });
    const me = (await call('/me', { token: adminToken })).body;
    const ownerPhone = (await call('/me', { token: ownerToken })).body.phone;

    // The owner's own edit and the admin's reads write nothing.
    await call(`/owner/hostels/${hostel.id}`, { token: ownerToken, method: 'PATCH', body: { description: 'Owner wrote this' } });
    await call(`/owner/hostels/${hostel.id}`, { token: adminToken });
    await call(`/owner/hostels/${hostel.id}/residents`, { token: adminToken });
    // A failed change writes nothing either.
    expect((await call(`/owner/hostels/${hostel.id}`, { token: adminToken, method: 'PATCH', body: { lat: 500 } })).status).toBe(400);
    expect(await auditOf('owner.admin_action')).toHaveLength(0);

    expect((await call(`/owner/hostels/${hostel.id}`, { token: adminToken, method: 'PATCH', body: { name: 'Owner House PG' } })).status).toBe(200);
    expect((await call(`/owner/rooms/${rooms[0].id}`, { token: adminToken, method: 'PATCH', body: { monthlyRent: 9500 } })).status).toBe(200);
    // Owner powers on the community board count too.
    const t = await newTenant('Resident One');
    await activeSubscriber(t.token, hostel.id, rooms[0].id);
    const post = await call(`/hostels/${hostel.id}/community`, { token: t.token, body: { kind: 'general', body: 'Hello all' } });
    expect((await call(`/posts/${post.body.id}`, { token: adminToken, method: 'PATCH', body: { hidden: true } })).status).toBe(200);

    const rows = await auditOf('owner.admin_action');
    expect(rows.map((r) => r.summary.split(' at ')[0])).toEqual(['Hid, showed or pinned a post', 'Edited a room type', 'Edited the listing']);
    for (const r of rows) {
      expect(r).toMatchObject({ targetId: hostel.id, actor: { id: me.id } });
      expect(r.summary).toContain(`+91 ${ownerPhone}`);
    }
    // The admin's change also reached the listing-changes trail, as an admin's.
    expect((await call('/admin/listing-changes', { token: adminToken })).body[0]).toMatchObject({ changedBy: { id: me.id, isOwner: false } });
  });
});

test('an owner cannot read the admin queues', async () => {
  for (const path of ['/admin/reports', '/admin/reviews/hidden', '/admin/content/hidden', '/admin/listing-changes']) {
    expect((await call(path, { token: ownerToken })).status).toBe(403);
  }
  expect((await call('/admin/content/post/pst_x/hide', { token: (await newOwner()), body: { reason: 'abc' } })).status).toBe(403);
});
