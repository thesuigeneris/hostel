import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { autoCloseResolvedIssues } from '../src/services/issues';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, nextPhone } from './fixtures';
import { call, login, resetDb } from './helpers';

/**
 * Issue rows from docs/product/edge-cases.md: I2 (one transition per status change, no duplicate timeline rows),
 * I3 (the timeline says when an issue closed on its own), I4 (the 7-day reopen window), I5 (a reporter who moved out),
 * I6 (me-too rules), I7 (other residents never learn who reported).
 */

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

type Update = { author: string; toStatus: string | null; fromStatus: string | null; message: string; byOwner: boolean; bySystem: boolean };

async function resident(name: string) {
  const t = await newTenant(name);
  await activeSubscriber(t.token, hostel.id, room.id);
  return t.token;
}

async function report(token: string, title = 'No hot water on the 2nd floor') {
  const res = await call(`/hostels/${hostel.id}/issues`, { token, body: { category: 'water', title, description: 'Since Monday' } });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const update = (token: string, id: string, body: Record<string, unknown>) => call(`/issues/${id}/updates`, { token, body });
const detail = async (token: string, id: string) => (await call(`/issues/${id}`, { token })).body;

describe('I2: one transition per status change', () => {
  test('the owner double-tapping "Resolved" resolves once; the other taps are told to refresh', async () => {
    const a = await resident('Anil Kumar');
    const id = await report(a);
    await update(ownerToken, id, { status: 'in_progress', from: 'open' });
    const taps = await Promise.all(
      Array.from({ length: 6 }, () => update(ownerToken, id, { status: 'resolved', from: 'in_progress', message: 'Plumber fixed the geyser.' })),
    );
    expect(taps.filter((t) => t.status === 200)).toHaveLength(1);
    for (const lost of taps.filter((t) => t.status !== 200)) {
      expect(lost.status).toBe(409);
      expect(lost.body.message).toBe('This issue just changed. Refresh to see the latest.');
    }
    const updates = (await detail(ownerToken, id)).updates as Update[];
    expect(updates.filter((u) => u.toStatus === 'resolved')).toHaveLength(1);
    expect(updates.filter((u) => u.message === 'Plumber fixed the geyser.')).toHaveLength(1);
  });

  test('a page showing an older status cannot move the issue; a repeat of the current status is refused', async () => {
    const a = await resident('Anil Kumar');
    const id = await report(a);
    expect((await update(ownerToken, id, { status: 'acknowledged', from: 'open' })).status).toBe(200);
    // A second tab still showing "open".
    const stale = await update(ownerToken, id, { status: 'in_progress', from: 'open' });
    expect(stale.status).toBe(409);
    // An older client that doesn't send `from` repeats the move it already made.
    expect((await update(ownerToken, id, { status: 'acknowledged' })).status).toBe(409);
    // Comments don't depend on the status.
    setClock('2026-11-09T06:05:00Z');
    expect((await update(a, id, { message: 'Still cold this morning.' })).status).toBe(200);
    const updates = (await detail(ownerToken, id)).updates as Update[];
    expect(updates.map((u) => u.toStatus)).toEqual(['acknowledged', null]);
  });

  test('a reopen racing the close job: exactly one of them happens', async () => {
    const a = await resident('Anil Kumar');
    const id = await report(a);
    await update(ownerToken, id, { status: 'resolved', from: 'open' });
    // The reporter is a minute inside the window; the job runs as if a minute past it.
    setClock('2026-11-16T05:59:00Z');
    const [reopen, closed] = await Promise.all([
      update(a, id, { status: 'open', from: 'resolved', message: 'Still broken' }),
      autoCloseResolvedIssues(new Date('2026-11-16T06:01:00Z')),
    ]);
    expect((reopen.status === 200 ? 1 : 0) + closed).toBe(1);
    if (reopen.status !== 200) expect(reopen.status).toBe(409);
    const after = await detail(a, id);
    const moves = (after.updates as Update[]).filter((u) => u.toStatus).map((u) => u.toStatus);
    expect(moves).toEqual(['resolved', after.status]);
  });
});

describe('I3 and I4: closing on its own, and the 7-day reopen window', () => {
  test('the timeline says the issue closed automatically, once', async () => {
    const a = await resident('Anil Kumar');
    const id = await report(a);
    await update(ownerToken, id, { status: 'resolved', from: 'open' });
    setClock('2026-11-16T06:00:00Z'); // exactly 7 days: not yet
    expect((await runJobs()).closedIssues).toBe(0);
    setClock('2026-11-16T06:01:00Z');
    expect((await runJobs()).closedIssues).toBe(1);
    expect((await runJobs()).closedIssues).toBe(0);

    for (const token of [a, ownerToken, await resident('Bina')]) {
      const seen = await detail(token, id);
      expect(seen.status).toBe('closed');
      const last = (seen.updates as Update[]).at(-1)!;
      expect(last).toMatchObject({ author: 'Automatic', bySystem: true, byOwner: false, fromStatus: 'resolved', toStatus: 'closed' });
      expect(last.message).toContain('Closed automatically after 7 days');
      expect((seen.updates as Update[]).filter((u) => u.bySystem)).toHaveLength(1);
    }
  });

  test('reopen at 6 days 23 hours is allowed; at 7 days and a minute it is refused with "report it again"', async () => {
    const a = await resident('Anil Kumar');
    const early = await report(a, 'Fan regulator broken');
    const late = await report(a, 'Window latch broken');
    for (const id of [early, late]) await update(ownerToken, id, { status: 'resolved', from: 'open' });

    setClock('2026-11-16T05:00:00Z'); // 6 days 23 hours
    const reopened = await update(a, early, { status: 'open', from: 'resolved', message: 'Still broken' });
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ status: 'open', resolvedAt: null });

    setClock('2026-11-16T06:01:00Z'); // 7 days 1 minute, before the job has run
    const refused = await update(a, late, { status: 'open', from: 'resolved' });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain('report it again');
    // Confirming the fix is still fine.
    expect((await update(a, late, { status: 'closed', from: 'resolved' })).body.status).toBe('closed');
  });
});

describe('I5: the reporter moves out before the fix', () => {
  test('the issue stays on the record; the former resident can still read it, but not act on it', async () => {
    const pro = await liveHostel(ownerToken, adminToken);
    await call(`/owner/hostels/${pro.hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });
    const phone = nextPhone();
    await call(`/owner/hostels/${pro.hostel.id}/residents`, { token: ownerToken, body: { phone, name: 'Ravi Kumar', monthlyRent: 7000, startDate: '2026-11-09' } });
    const ravi = await login(phone);
    await call('/me', { token: ravi, method: 'PATCH', body: { name: 'Ravi Kumar' } });
    const stay = (await call('/me/residencies', { token: ravi })).body[0];
    await call(`/me/residencies/${stay.id}/accept`, { token: ravi, method: 'POST' });
    const issue = await call(`/hostels/${pro.hostel.id}/issues`, { token: ravi, body: { category: 'wifi', title: 'WiFi drops every evening' } });
    await update(ravi, issue.body.id, { message: 'Router in the corridor blinks red.' });
    setClock('2026-11-12T06:00:00Z');
    expect((await call(`/me/residencies/${stay.id}/move-out`, { token: ravi, method: 'POST' })).status).toBe(200);

    const mine = await call(`/issues/${issue.body.id}`, { token: ravi });
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ mine: true, readOnly: true, reporter: { name: 'Ravi Kumar' }, status: 'open' });
    expect(mine.body.updates[0]).toMatchObject({ author: 'Ravi', message: 'Router in the corridor blinks red.' });
    const listed = (await call('/me/issues', { token: ravi })).body;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: issue.body.id, readOnly: true });

    for (const body of [{ message: 'Any news?' }, { status: 'closed' }]) {
      const res = await update(ravi, issue.body.id, body);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain("You've moved out");
    }
    // The hostel still sees it and can resolve it; it counts on the public record.
    expect((await call('/owner/issues', { token: ownerToken })).body.map((i: { id: string }) => i.id)).toContain(issue.body.id);
    expect((await update(ownerToken, issue.body.id, { status: 'resolved', from: 'open' })).status).toBe(200);
    expect((await detail(ravi, issue.body.id)).status).toBe('resolved');
    // The board and the issue list are for current residents.
    expect((await call(`/hostels/${pro.hostel.id}/issues`, { token: ravi })).status).toBe(403);
  });

  test('anyone else outside the hostel gets 404 for an issue, and for a post', async () => {
    const a = await resident('Anil Kumar');
    const id = await report(a);
    const post = await call(`/hostels/${hostel.id}/community`, { token: a, body: { kind: 'general', body: 'Movie night Friday?' } });
    const outsider = (await newTenant('Outsider')).token;
    expect((await call(`/issues/${id}`, { token: outsider })).status).toBe(404);
    expect((await update(outsider, id, { message: 'hi' })).status).toBe(404);
    expect((await call(`/issues/${id}/upvote`, { token: outsider, method: 'PUT' })).status).toBe(404);
    expect((await call(`/posts/${post.body.id}/comments`, { token: outsider, body: { body: 'hi' } })).status).toBe(404);
    expect((await call(`/posts/${post.body.id}/report`, { token: outsider, body: { reason: 'Spam here' } })).status).toBe(404);
    expect((await call('/me/issues', { token: outsider })).body).toEqual([]);
  });
});

describe('I6: me-too', () => {
  test('not on your own issue; twice counts once; not on a closed issue', async () => {
    const a = await resident('Anil Kumar');
    const b = await resident('Bina');
    const id = await report(a);
    const own = await call(`/issues/${id}/upvote`, { token: a, method: 'PUT' });
    expect(own.status).toBe(409);
    expect(own.body.message).toBe('You reported this issue');
    const twice = await Promise.all([1, 2, 3].map(() => call(`/issues/${id}/upvote`, { token: b, method: 'PUT' })));
    expect(twice.map((r) => r.status)).toEqual([200, 200, 200]);
    expect((await detail(b, id)).upvotes).toBe(1);

    await update(ownerToken, id, { status: 'resolved', from: 'open' });
    await update(a, id, { status: 'closed', from: 'resolved' });
    for (const method of ['PUT', 'DELETE']) {
      const closed = await call(`/issues/${id}/upvote`, { token: b, method });
      expect(closed.status).toBe(409);
      expect(closed.body.message).toBe("This issue is closed, so me-toos are off. If it's back, report it again.");
    }
    expect((await detail(b, id)).upvotes).toBe(1);
  });
});

describe('I7: other residents never learn who reported', () => {
  test('lists and timelines hide the reporter; comments by residents show as "Resident" to others', async () => {
    const a = await resident('Anil Kumar');
    const b = await resident('Bina Shah');
    const c = await resident('Chitra Rao');
    const id = await report(a);
    // The timeline is in time order, so each update gets its own minute.
    setClock('2026-11-09T06:01:00Z');
    await update(a, id, { message: 'It is the 2nd floor geyser.' });
    setClock('2026-11-09T06:02:00Z');
    await update(b, id, { message: 'Same in my room.' });
    setClock('2026-11-09T06:03:00Z');
    await update(ownerToken, id, { status: 'acknowledged', from: 'open', message: 'Plumber booked.' });

    const asC = await detail(c, id);
    expect(asC.reporter).toBeNull();
    expect((asC.updates as Update[]).map((u) => u.author)).toEqual(['Resident', 'Resident', 'Hostel']);
    expect(JSON.stringify(asC)).not.toContain('Anil');
    const listC = (await call(`/hostels/${hostel.id}/issues`, { token: c })).body;
    expect(listC[0].reporter).toBeNull();
    expect(JSON.stringify(listC)).not.toContain('Anil');

    expect((await detail(a, id)).updates.map((u: Update) => u.author)).toEqual(['Anil', 'Resident', 'Hostel']);
    expect((await detail(b, id)).updates.map((u: Update) => u.author)).toEqual(['Resident', 'Bina', 'Hostel']);
    const asOwner = await detail(ownerToken, id);
    expect(asOwner.reporter.name).toBe('Anil Kumar');
    expect(asOwner.updates.map((u: Update) => u.author)).toEqual(['Anil', 'Bina', 'Hostel']);
    // An admin's update says it came from our team.
    setClock('2026-11-09T06:04:00Z');
    await update(adminToken, id, { message: 'We are following this up.' });
    expect((await detail(c, id)).updates.at(-1).author).toBe('Hostels team');
  });
});
