import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, nextPhone } from './fixtures';
import { call, login, resetDb } from './helpers';

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

const REVIEW = { rating: 4, cleanliness: 5, food: 4, safety: 5, responsiveness: 3, body: 'Clean rooms, fast WiFi, owner fixes issues quickly.' };

describe('verified reviews', () => {
  test('only residents of 14+ days can review; one review per hostel, editable', async () => {
    const t = await newTenant('Asha Rao');
    const stranger = await newTenant('Stranger');
    expect((await call(`/hostels/${hostel.id}/review`, { token: stranger.token, method: 'PUT', body: REVIEW })).body.error).toBe('review_not_allowed');

    await activeSubscriber(t.token, hostel.id, room.id);
    const early = await call(`/hostels/${hostel.id}/review`, { token: t.token, method: 'PUT', body: REVIEW });
    expect(early.body.error).toBe('review_not_allowed');
    expect(early.body.message).toContain('14 days');

    setClock('2026-11-23T06:00:00Z');
    const ok = await call(`/hostels/${hostel.id}/review`, { token: t.token, method: 'PUT', body: REVIEW });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ rating: 4, author: 'Asha R.', verifiedVia: 'subscription', stay: { from: '2026-11-09', to: null } });
    const edited = await call(`/hostels/${hostel.id}/review`, { token: t.token, method: 'PUT', body: { ...REVIEW, rating: 5 } });
    expect(edited.body.id).toBe(ok.body.id);

    const pub = await call(`/hostels/${hostel.slug}/reviews`);
    expect(pub.body).toHaveLength(1);
    const detail = await call(`/hostels/${hostel.slug}`);
    expect(detail.body.ratings).toMatchObject({ rating: 5, reviewCount: 1, cleanliness: 5, responsiveness: 3 });
    const search = await call('/hostels?minRating=4.5');
    expect(search.body.items[0]).toMatchObject({ rating: 5, reviewCount: 1 });

    // Owner replies once; admin hides after a flag and the average drops out.
    const reply = await call(`/owner/reviews/${ok.body.id}/reply`, { token: ownerToken, body: { reply: 'Thanks Asha!' } });
    expect(reply.body.ownerReply).toBe('Thanks Asha!');
    expect((await call(`/owner/reviews/${ok.body.id}/reply`, { token: ownerToken, body: { reply: 'Again' } })).body.error).toBe('invalid_state');
    await call(`/reviews/${ok.body.id}/flag`, { token: stranger.token, body: { reason: 'Looks fake' } });
    const flagged = await call('/admin/reviews/flagged', { token: adminToken });
    expect(flagged.body[0].flags).toBe(1);
    await call(`/admin/reviews/${ok.body.id}/hide`, { token: adminToken, body: { reason: 'Personal data' } });
    expect((await call(`/hostels/${hostel.slug}/reviews`)).body).toHaveLength(0);
    expect((await call(`/hostels/${hostel.slug}`)).body.ratings.reviewCount).toBe(0);
    expect((await call('/admin/reviews/flagged', { token: adminToken })).body).toHaveLength(0);
  });
});

describe('owner-added residents', () => {
  test('Pro plan is needed; the invited phone accepts on login; the owner cannot add themselves', async () => {
    const free = await liveHostel(ownerToken, adminToken);
    const phone = nextPhone();
    const body = { phone, name: 'Ravi', monthlyRent: 7000, startDate: '2026-10-01' };
    expect((await call(`/owner/hostels/${free.hostel.id}/residents`, { token: ownerToken, body })).body.error).toBe('plan_required');

    const up = await call(`/owner/hostels/${free.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });
    expect(up.body).toMatchObject({ price: 999, inTrial: true });
    const added = await call(`/owner/hostels/${free.hostel.id}/residents`, { token: ownerToken, body });
    expect(added.body).toMatchObject({ status: 'invited', userId: null, source: 'owner' });
    expect((await call(`/owner/hostels/${free.hostel.id}/residents`, { token: ownerToken, body })).body.error).toBe('invalid_state');
    const me = await call('/me', { token: ownerToken });
    const self = await call(`/owner/hostels/${free.hostel.id}/residents`, { token: ownerToken, body: { ...body, phone: me.body.phone } });
    expect(self.body.error).toBe('invalid_state');

    const residentToken = await login(phone);
    const stays = await call('/me/residencies', { token: residentToken });
    expect(stays.body[0]).toMatchObject({ status: 'invited', hostel: { id: free.hostel.id } });
    const accepted = await call(`/me/residencies/${stays.body[0].id}/accept`, { token: residentToken, method: 'POST' });
    expect(accepted.body.status).toBe('active');

    // Rent tracker.
    const rec = await call(`/owner/hostels/${free.hostel.id}/rent/${added.body.id}`, {
      token: ownerToken,
      method: 'PUT',
      body: { month: '2026-11', amountPaid: 3500, method: 'upi' },
    });
    expect(rec.body).toMatchObject({ amountDue: 7000, amountPaid: 3500, paidOn: '2026-11-09' });
    const sheet = await call(`/owner/hostels/${free.hostel.id}/rent?month=2026-11`, { token: ownerToken });
    expect(sheet.body.rows[0]).toMatchObject({ name: 'Ravi', status: 'partial' });
    expect(sheet.body.totals).toEqual({ due: 7000, collected: 3500, unpaid: 1 });

    // Staying 14+ days lets them review as a verified resident (added by the hostel).
    const review = await call(`/hostels/${free.hostel.id}/review`, { token: residentToken, method: 'PUT', body: REVIEW });
    expect(review.body.verifiedVia).toBe('owner');
  });
});

describe('issues', () => {
  test('report, anonymity, owner workflow, confirm, transparency stats', async () => {
    const a = await newTenant('Anil Kumar');
    const b = await newTenant('Bina');
    await activeSubscriber(a.token, hostel.id, room.id);
    await activeSubscriber(b.token, hostel.id, room.id);
    const outsider = await newTenant('Out');

    expect((await call(`/hostels/${hostel.id}/issues`, { token: outsider.token, body: { category: 'wifi', title: 'No WiFi' } })).body.error).toBe(
      'not_a_resident',
    );
    const issue = await call(`/hostels/${hostel.id}/issues`, { token: a.token, body: { category: 'water', title: 'No hot water', description: 'Since Monday' } });
    expect(issue.status).toBe(201);

    const seenByB = await call(`/hostels/${hostel.id}/issues`, { token: b.token });
    expect(seenByB.body[0]).toMatchObject({ title: 'No hot water', reporter: null, mine: false });
    const seenByOwner = await call('/owner/issues', { token: ownerToken });
    expect(seenByOwner.body[0].reporter.name).toBe('Anil Kumar');

    const metoo = await call(`/issues/${issue.body.id}/upvote`, { token: b.token, method: 'PUT' });
    expect(metoo.body.upvotes).toBe(1);
    expect((await call(`/issues/${issue.body.id}/upvote`, { token: a.token, method: 'PUT' })).body.error).toBe('invalid_state');

    // Residents cannot move status; owner moves forward only.
    expect((await call(`/issues/${issue.body.id}/updates`, { token: b.token, body: { status: 'resolved' } })).status).toBe(403);
    setClock('2026-11-09T08:00:00Z');
    const ack = await call(`/issues/${issue.body.id}/updates`, { token: ownerToken, body: { status: 'acknowledged', message: 'Plumber coming' } });
    expect(ack.body.status).toBe('acknowledged');
    expect(ack.body.updates[0]).toMatchObject({ author: 'Hostel', toStatus: 'acknowledged' });
    expect((await call(`/issues/${issue.body.id}/updates`, { token: ownerToken, body: { status: 'open' } })).status).toBe(403);
    setClock('2026-11-10T06:00:00Z');
    await call(`/issues/${issue.body.id}/updates`, { token: ownerToken, body: { status: 'resolved' } });
    const reopened = await call(`/issues/${issue.body.id}/updates`, { token: a.token, body: { status: 'open', message: 'Still cold' } });
    expect(reopened.body.status).toBe('open');
    await call(`/issues/${issue.body.id}/updates`, { token: ownerToken, body: { status: 'resolved' } });
    const closed = await call(`/issues/${issue.body.id}/updates`, { token: a.token, body: { status: 'closed' } });
    expect(closed.body.status).toBe('closed');

    // Transparency appears from 3 issues: 1 closed, 1 resolved, 1 open.
    expect((await call(`/hostels/${hostel.slug}`)).body.transparency).toBeNull();
    const i2 = await call(`/hostels/${hostel.id}/issues`, { token: b.token, body: { category: 'wifi', title: 'WiFi slow at night' } });
    await call(`/hostels/${hostel.id}/issues`, { token: a.token, body: { category: 'food', title: 'Dinner was cold' } });
    setClock('2026-11-10T08:00:00Z');
    await call(`/issues/${i2.body.id}/updates`, { token: ownerToken, body: { status: 'resolved' } });
    const t = (await call(`/hostels/${hostel.slug}`)).body.transparency;
    expect(t).toMatchObject({ windowDays: 90, reported: 3, resolvedPct: 67 });
    expect(t.medianHoursToFirstResponse).toBeGreaterThan(0);

    // Resolved issues the reporter ignores close after 7 days.
    setClock('2026-11-18T08:00:00Z');
    expect((await runJobs()).closedIssues).toBe(1);
  });
});

describe('community board', () => {
  test('residents and the owner share a board; announcements and moderation are owner-only', async () => {
    const a = await newTenant('Anil Kumar');
    const b = await newTenant('Bina');
    await activeSubscriber(a.token, hostel.id, room.id);
    await activeSubscriber(b.token, hostel.id, room.id);
    const outsider = await newTenant();

    expect((await call(`/hostels/${hostel.id}/community`, { token: outsider.token })).body.error).toBe('not_a_resident');
    expect((await call(`/hostels/${hostel.id}/community`, { token: a.token, body: { kind: 'announcement', body: 'Hi' } })).status).toBe(403);
    const post = await call(`/hostels/${hostel.id}/community`, { token: a.token, body: { kind: 'event', body: 'Cricket on Saturday?' } });
    expect(post.status).toBe(201);
    await call(`/hostels/${hostel.id}/community`, { token: ownerToken, body: { kind: 'announcement', body: 'Tank cleaning Sunday' } });
    await call(`/posts/${post.body.id}/comments`, { token: b.token, body: { body: 'I am in' } });

    const feed = await call(`/hostels/${hostel.id}/community`, { token: b.token });
    expect(feed.body.map((p: { kind: string }) => p.kind)).toEqual(['announcement', 'event']);
    expect(feed.body[0].author).toBe('Hostel');
    expect(feed.body[1]).toMatchObject({ author: 'Anil', mine: false });
    expect(feed.body[1].comments[0]).toMatchObject({ author: 'Bina', mine: true });

    await call(`/posts/${post.body.id}/report`, { token: b.token, body: { reason: 'Spam' } });
    expect((await call('/owner/reports', { token: ownerToken })).body).toHaveLength(1);
    expect((await call(`/posts/${post.body.id}`, { token: b.token, method: 'PATCH', body: { hidden: true } })).status).toBe(403);
    await call(`/posts/${post.body.id}`, { token: ownerToken, method: 'PATCH', body: { hidden: true } });
    expect((await call(`/hostels/${hostel.id}/community`, { token: b.token })).body).toHaveLength(1);
    expect((await call('/owner/reports', { token: ownerToken })).body).toHaveLength(0);

    // Directory shows opted-in residents by name and room type, never phones.
    const stays = (await call('/me/residencies', { token: a.token })).body;
    await call(`/me/residencies/${stays[0].id}`, { token: a.token, method: 'PATCH', body: { directoryOptIn: true } });
    const dir = await call(`/hostels/${hostel.id}/directory`, { token: b.token });
    expect(dir.body).toEqual([{ name: 'Anil Kumar', sharing: '2-sharing', since: '2026-11-09' }]);
  });
});

describe('owner plans and platform bills', () => {
  test('trial, then monthly bills; 15 days overdue pauses Pro features until paid', async () => {
    const free = await liveHostel(ownerToken, adminToken);
    await call(`/owner/hostels/${free.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });

    // Trial month: no bill.
    setClock('2026-12-03T06:00:00Z');
    expect((await runJobs()).ownerInvoices).toBe(0);
    // Second period starts 9 Dec; billed 5 days ahead (for this hostel and the Partner one from setup).
    setClock('2026-12-04T06:00:00Z');
    expect((await runJobs()).ownerInvoices).toBe(2);
    expect((await runJobs()).ownerInvoices).toBe(0);
    const plan = await call(`/owner/hostels/${free.hostel.id}/plan`, { token: ownerToken });
    expect(plan.body.inTrial).toBe(true);
    expect(plan.body.bills[0]).toMatchObject({ amount: 999, periodStart: '2026-12-09', dueDate: '2026-12-09', status: 'due' });

    await call(`/owner/hostels/${free.hostel.id}/residents`, {
      token: ownerToken,
      body: { phone: nextPhone(), name: 'X', monthlyRent: 5000, startDate: '2026-11-01' },
    });
    setClock('2026-12-25T06:00:00Z');
    await runJobs();
    const paused = await call(`/owner/hostels/${free.hostel.id}/rent`, { token: ownerToken });
    expect(paused.body.error).toBe('plan_required');
    expect(paused.body.message).toContain('overdue');

    const bill = plan.body.bills[0];
    const pay = await call(`/payments/${bill.id}/simulate`, { token: ownerToken, method: 'POST' });
    expect(pay.body).toMatchObject({ kind: 'owner', status: 'paid' });
    expect((await call(`/owner/hostels/${free.hostel.id}/rent`, { token: ownerToken })).status).toBe(200);
  });

  test('downgrades wait for the end of the paid month; partners with subscribers cannot leave', async () => {
    const t = await newTenant();
    await activeSubscriber(t.token, hostel.id, room.id);
    expect((await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken, body: { plan: 'free' } })).body.error).toBe('invalid_state');

    const other = await liveHostel(ownerToken, adminToken);
    await call(`/owner/hostels/${other.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });
    // During the trial a downgrade is immediate.
    const now = await call(`/owner/hostels/${other.hostel.id}/plan`, { token: ownerToken, body: { plan: 'free' } });
    expect(now.body.plan.plan).toBe('free');
    // Back to Pro after the trial window: billing starts now and a downgrade waits for the period end.
    setClock('2026-12-15T06:00:00Z');
    await call(`/owner/hostels/${other.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });
    const later = await call(`/owner/hostels/${other.hostel.id}/plan`, { token: ownerToken, body: { plan: 'free' } });
    expect(later.body.plan).toMatchObject({ plan: 'pro', pendingPlan: 'free', pendingPlanOn: '2027-01-15' });
    expect(later.body.inTrial).toBe(false);
    await runJobs();
    expect((await call(`/owner/hostels/${other.hostel.id}/plan`, { token: ownerToken })).body.bills).toHaveLength(1);
    setClock('2027-01-15T06:00:00Z');
    expect((await runJobs()).planChanges).toBe(1);
    expect((await call(`/owner/hostels/${other.hostel.id}/plan`, { token: ownerToken })).body.plan.plan).toBe('free');
  });

  test('admins see owner bills; another owner cannot pay mine', async () => {
    const free = await liveHostel(ownerToken, adminToken);
    await call(`/owner/hostels/${free.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });
    setClock('2026-12-15T06:00:00Z');
    await runJobs();
    const bills = (await call('/admin/owner-invoices', { token: adminToken })).body;
    expect(bills.length).toBeGreaterThan(0);
    const stranger = await newOwner();
    expect((await call(`/payments/${bills[0].id}`, { token: stranger })).status).toBe(404);
  });
});

describe('uploads', () => {
  const upload = (token: string, bytes: Uint8Array, name = 'p.jpg', type = 'image/jpeg') => {
    const form = new FormData();
    form.append('file', new File([bytes], name, { type }));
    return import('./helpers').then(({ app }) =>
      app.request('/uploads', { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } }),
    );
  };

  test('checks the file signature, not the name, and serves the file back', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const ok = await upload(ownerToken, png, 'photo.jpg');
    expect(ok.status).toBe(201);
    const { key, url } = (await ok.json()) as { key: string; url: string };
    expect(key).toEndWith('.png');
    expect(url).toContain(`/uploads/${key}`);
    const { app } = await import('./helpers');
    const back = await app.request(`/uploads/${key}`);
    expect(back.headers.get('content-type')).toBe('image/png');

    const fake = await upload(ownerToken, new TextEncoder().encode('<script>alert(1)</script>'), 'x.png', 'image/png');
    expect(fake.status).toBe(400);
    const big = await upload(ownerToken, new Uint8Array(6 * 1024 * 1024).fill(0xff), 'big.jpg');
    expect(big.status).toBe(413);
    expect((await app.request('/uploads/../../etc/passwd')).status).toBe(404);
    expect((await app.request('/uploads', { method: 'POST', body: new FormData() })).status).toBe(401);
  });
});
