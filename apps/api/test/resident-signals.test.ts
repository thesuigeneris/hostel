import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant } from './fixtures';
import { call, resetDb } from './helpers';

/**
 * Product gap 1b: in-app signals for residents (spec docs/superpowers/specs/2026-11-13-resident-signals.md). An update
 * on an issue you reported, by anyone but you, is unread until you open the issue. The clock moves a minute between
 * steps, as it would between real actions.
 */

let ownerToken: string;
let adminToken: string;
let hostel: { id: string };
let room: { id: string };
let minute = 0;
const tick = () => setClock(new Date(Date.UTC(2026, 10, 9, 6, ++minute)).toISOString());

beforeEach(async () => {
  await resetDb();
  minute = 0;
  tick();
  ownerToken = await newOwner();
  adminToken = await admin();
  const h = await liveHostel(ownerToken, adminToken, { partner: true });
  hostel = h.hostel;
  room = h.rooms[0]!;
});

afterEach(() => setClock(null));

async function resident(name: string) {
  const t = await newTenant(name);
  await activeSubscriber(t.token, hostel.id, room.id);
  return t.token;
}

async function report(token: string) {
  tick();
  const res = await call(`/hostels/${hostel.id}/issues`, { token, body: { category: 'water', title: 'No hot water', description: 'Since Monday' } });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const comment = (token: string, id: string, message: string) => {
  tick();
  return call(`/issues/${id}/updates`, { token, body: { message } });
};
const signals = async (token: string) => (await call('/me/signals', { token })).body;
const unreadOf = async (token: string, id: string) =>
  ((await call('/me/issues', { token })).body as { id: string; unreadUpdates: number }[]).find((i) => i.id === id)?.unreadUpdates;
const open = async (token: string, id: string) => {
  tick();
  return (await call(`/issues/${id}`, { token })).body;
};

describe('unread updates on my issues (1b)', () => {
  test('the hostel answering shows as unread until I open the issue; writing on it myself reads it too', async () => {
    const me = await resident('Anil Kumar');
    const id = await report(me);
    expect(await signals(me)).toEqual({ issuesWithUpdates: 0, issueUpdates: 0 });

    expect((await comment(me, id, 'Still cold this morning')).status).toBe(200);
    expect(await unreadOf(me, id)).toBe(0);

    expect((await comment(ownerToken, id, 'Plumber coming at 5')).status).toBe(200);
    expect((await comment(ownerToken, id, 'He is here')).status).toBe(200);
    expect(await unreadOf(me, id)).toBe(2);
    expect(await signals(me)).toEqual({ issuesWithUpdates: 1, issueUpdates: 2 });

    // Opening it marks the two as new, once, and clears the badge.
    const first = await open(me, id);
    expect(first.unreadUpdates).toBe(0);
    expect(first.updates.map((u: { message: string; isNew: boolean }) => [u.message, u.isNew])).toEqual([
      ['Still cold this morning', false],
      ['Plumber coming at 5', true],
      ['He is here', true],
    ]);
    expect(await signals(me)).toEqual({ issuesWithUpdates: 0, issueUpdates: 0 });
    expect((await open(me, id)).updates.some((u: { isNew: boolean }) => u.isNew)).toBe(false);

    // Replying without opening first (the reply returns the issue) reads it too.
    await comment(ownerToken, id, 'Fixed?');
    expect(await unreadOf(me, id)).toBe(1);
    await comment(me, id, 'Checking now');
    expect(await unreadOf(me, id)).toBe(0);

    // A later status change is new again.
    tick();
    expect((await call(`/issues/${id}/updates`, { token: ownerToken, body: { status: 'resolved', from: 'open' } })).status).toBe(200);
    expect(await signals(me)).toEqual({ issuesWithUpdates: 1, issueUpdates: 1 });
  });

  test('only the reporter gets the signal; others opening the issue do not clear it', async () => {
    const me = await resident('Anil Kumar');
    const neighbour = await resident('Bina Rao');
    const id = await report(me);
    await comment(neighbour, id, 'Same on my floor');
    expect(await unreadOf(me, id)).toBe(1);

    // The neighbour and the owner see the issue with nothing unread, and opening it changes nothing for me.
    const seenByNeighbour = (await call(`/hostels/${hostel.id}/issues`, { token: neighbour })).body.find((i: { id: string }) => i.id === id);
    expect(seenByNeighbour.unreadUpdates).toBe(0);
    expect((await open(neighbour, id)).updates.every((u: { isNew: boolean }) => !u.isNew)).toBe(true);
    await open(ownerToken, id);
    expect(await signals(neighbour)).toEqual({ issuesWithUpdates: 0, issueUpdates: 0 });
    expect(await signals(me)).toEqual({ issuesWithUpdates: 1, issueUpdates: 1 });
  });

  test('an issue closing on its own is an update too', async () => {
    const me = await resident('Anil Kumar');
    const id = await report(me);
    tick();
    await call(`/issues/${id}/updates`, { token: ownerToken, body: { status: 'resolved', from: 'open' } });
    await open(me, id);
    expect(await signals(me)).toEqual({ issuesWithUpdates: 0, issueUpdates: 0 });
    setClock('2026-11-17T06:00:00Z');
    expect((await runJobs()).closedIssues).toBe(1);
    expect(await signals(me)).toEqual({ issuesWithUpdates: 1, issueUpdates: 1 });
  });

  test('signals need a signed-in user', async () => {
    expect((await call('/me/signals')).status).toBe(401);
  });
});
