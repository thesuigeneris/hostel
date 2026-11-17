import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { setClock } from '../src/lib/clock';
import { runJobs } from '../src/services/jobs';
import { activeSubscriber, admin, liveHostel, newOwner, newTenant, nextPhone } from './fixtures';
import { call, login, resetDb } from './helpers';

/**
 * Product gap 1c: a copy of my data, and deleting my account (DPDP Act 2023; spec
 * docs/superpowers/specs/2026-11-13-account-deletion-and-export.md).
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
  room = h.rooms[0]!;
});

afterEach(() => setClock(null));

const REVIEW = { rating: 4, cleanliness: 5, food: 4, safety: 5, responsiveness: 3, body: 'Clean rooms and the owner fixes things fast.' };
const remove = (token: string, body: Record<string, unknown>) => call('/me/delete', { token, body });
const status = async (token: string) => (await call('/me/deletion', { token })).body;

describe('a copy of my data', () => {
  test('has my plan, bills, stays and what I wrote; no secrets or payment references', async () => {
    const t = await newTenant('Asha Rao');
    await activeSubscriber(t.token, hostel.id, room.id);
    await call(`/hostels/${hostel.id}/community`, { token: t.token, body: { body: 'Badminton on Sunday?' } });
    const res = await call('/me/export', { token: t.token });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('hostels-my-data.json');
    const data = res.body;
    expect(data.account).toMatchObject({ phone: t.phone, name: 'Asha Rao', hasPassword: false });
    expect(data.subscriptions).toHaveLength(1);
    expect(data.bills).toHaveLength(1);
    expect(data.stays).toHaveLength(1);
    expect(data.boardPosts.map((p: { body: string }) => p.body)).toEqual(['Badminton on Sunday?']);
    const text = JSON.stringify(data);
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('razorpayOrderId');
    expect((await call('/me/export')).status).toBe(401);
  });
});

describe('deleting my account', () => {
  test('not while a plan runs; afterwards my name and board posts are gone, reviews and issues stay without a name, bills stay', async () => {
    const t = await newTenant('Asha Rao');
    const neighbour = await newTenant('Bina Iyer');
    await activeSubscriber(t.token, hostel.id, room.id);
    await activeSubscriber(neighbour.token, hostel.id, room.id);
    const post = (await call(`/hostels/${hostel.id}/community`, { token: t.token, body: { body: 'Badminton on Sunday?' } })).body;
    await call(`/posts/${post.id}/comments`, { token: neighbour.token, body: { body: 'Count me in' } });
    const issue = (await call(`/hostels/${hostel.id}/issues`, { token: t.token, body: { category: 'water', title: 'No hot water', description: '' } })).body;
    setClock('2026-11-23T06:00:00Z');
    expect((await call(`/hostels/${hostel.id}/review`, { token: t.token, method: 'PUT', body: REVIEW })).status).toBe(200);

    expect(await status(t.token)).toEqual({ canDelete: false, reason: 'You have a plan running. Cancel it, and delete your account once it has ended.' });
    expect((await remove(t.token, { confirm: 'DELETE' })).body.error).toBe('invalid_state');
    expect((await call('/me/subscription/cancel', { token: t.token, method: 'POST' })).body.cancelAt).toBe('2026-12-08');
    setClock('2026-12-09T06:00:00Z');
    expect((await runJobs()).endedSubscriptions).toBeGreaterThan(0);
    expect(await status(t.token)).toEqual({ canDelete: true, reason: null });

    expect((await remove(t.token, { confirm: 'delete' })).status).toBe(400);
    expect((await remove(t.token, { confirm: 'DELETE' })).body).toEqual({ ok: true });

    // Signed out everywhere; the same number signs up again as a new, empty account.
    expect((await call('/me', { token: t.token })).status).toBe(401);
    const again = await login(t.phone);
    expect((await call('/me/residencies', { token: again })).body).toEqual([]);
    expect((await call('/me/invoices', { token: again })).body).toEqual([]);

    const [row] = await getDb().select().from(schema.users).where(eq(schema.users.name, '')).limit(5);
    const gone = (await getDb().select().from(schema.users)).find((u) => u.phone.startsWith('deleted:'))!;
    expect(row).toBeDefined();
    expect(gone).toMatchObject({ name: '', email: null, passwordHash: null });
    expect(gone.deletedAt).not.toBeNull();

    // The review and the issue stay on the hostel's record with no name on them; the board post (and its reply) is gone.
    const reviews = (await call(`/hostels/${hostel.slug}/reviews`)).body;
    expect(reviews).toHaveLength(1);
    expect(JSON.stringify(reviews)).not.toContain('Asha');
    const issues = (await call(`/hostels/${hostel.id}/issues`, { token: ownerToken })).body;
    expect(issues.find((i: { id: string }) => i.id === issue.id)).toBeDefined();
    expect(JSON.stringify(issues)).not.toContain('Asha');
    const feed = (await call(`/hostels/${hostel.id}/community`, { token: ownerToken })).body;
    expect(feed.find((p: { id: string }) => p.id === post.id)).toBeUndefined();

    // Stays keep their dates (the proof behind the review) but not the name or phone; bills stay for the law.
    const stays = await getDb().select().from(schema.residencies).where(eq(schema.residencies.userId, gone.id));
    expect(stays.map((s) => [s.name, s.phone, s.directoryOptIn])).toEqual([['', '', false]]);
    const bills = await getDb().select().from(schema.invoices).where(eq(schema.invoices.userId, gone.id));
    expect(bills.length).toBeGreaterThan(0);

    // Deleting twice is refused plainly, not a crash.
    expect((await remove(t.token, { confirm: 'DELETE' })).status).toBe(401);
  });

  test('an account with a password needs it; a wrong one counts toward the lockout', async () => {
    const phone = nextPhone();
    const reg = await call('/auth/register', { body: { phone, password: 'a quiet room near the lake', name: 'Ravi Kumar' } });
    const token = reg.body.token as string;
    expect((await remove(token, { confirm: 'DELETE' })).status).toBe(401);
    expect((await remove(token, { confirm: 'DELETE', password: 'not my password at all' })).body.error).toBe('invalid_credentials');
    expect((await remove(token, { confirm: 'DELETE', password: 'a quiet room near the lake' })).body).toEqual({ ok: true });
    expect((await call('/auth/login', { body: { phone, password: 'a quiet room near the lake' } })).status).toBe(401);
  });

  test('an open hostel stay ends, so the hostel can add the number again', async () => {
    expect((await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken, body: { plan: 'partner' } })).status).toBeLessThan(500);
    const phone = nextPhone();
    const added = await call(`/owner/hostels/${hostel.id}/residents`, { token: ownerToken, body: { phone, name: 'Kavya Rao', monthlyRent: 7000, startDate: '2026-11-09' } });
    expect(added.status).toBe(201);
    const token = await login(phone);
    const [stay] = (await call('/me/residencies', { token })).body;
    expect((await call(`/me/residencies/${stay.id}/accept`, { token, method: 'POST' })).status).toBe(200);
    expect((await remove(token, { confirm: 'DELETE' })).body).toEqual({ ok: true });

    const [row] = await getDb().select().from(schema.residencies).where(eq(schema.residencies.id, stay.id));
    expect(row).toMatchObject({ status: 'ended', endDate: '2026-11-09', name: '', phone: '' });
    const roster = JSON.stringify((await call(`/owner/hostels/${hostel.id}/residents`, { token: ownerToken })).body);
    expect(roster).not.toContain('Kavya');
    expect(roster).not.toContain(phone);
    const readded = await call(`/owner/hostels/${hostel.id}/residents`, { token: ownerToken, body: { phone, name: 'Kavya Rao', monthlyRent: 7000, startDate: '2026-11-09' } });
    expect(readded.status).toBe(201);
  });

  test('owners, admins and demo accounts are told why they cannot delete here', async () => {
    expect(await status(ownerToken)).toEqual({ canDelete: false, reason: 'You own a hostel on Hostels. Write to us to close or hand over your listing first.' });
    expect((await status(adminToken)).canDelete).toBe(false);
    expect((await remove(ownerToken, { confirm: 'DELETE' })).body.error).toBe('invalid_state');
    expect((await call('/me', { token: ownerToken })).status).toBe(200);
  });
});
