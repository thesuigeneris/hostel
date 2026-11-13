import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { normalizeIp } from '../src/lib/client-ip';
import { setClock } from '../src/lib/clock';
import { productionConfigProblems } from '../src/lib/config-check';
import { resetRateLimits } from '../src/lib/rate-limit';
import { admin, liveHostel, newOwner, newTenant, nextPhone } from './fixtures';
import { call, resetDb } from './helpers';

const saved = { factor: process.env.RATE_LIMIT_FACTOR };

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
  resetRateLimits();
  process.env.RATE_LIMIT_FACTOR = '1';
});

afterEach(() => {
  setClock(null);
  process.env.RATE_LIMIT_FACTOR = saved.factor;
  Reflect.deleteProperty(process.env, 'TRUST_PROXY');
  Reflect.deleteProperty(process.env, 'RATE_LIMITS');
  resetRateLimits();
});

/** A sign-up attempt; the body is incomplete on purpose (it is refused after it is counted). */
const signup = (opts: { ip?: string; headers?: Record<string, string> } = {}) => call('/auth/register', { body: { phone: nextPhone() }, ...opts });

async function exhaust(n: number, send: () => Promise<{ status: number }>) {
  for (let i = 0; i < n; i++) expect((await send()).status).not.toBe(429);
}

describe('limits per network address', () => {
  test('sign-up: 10 an hour per address, then 429 in plain words with Retry-After; another address is not affected', async () => {
    await exhaust(10, () => signup({ ip: '198.51.100.7' }));
    const blocked = await signup({ ip: '198.51.100.7' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'rate_limited', message: 'Too many sign-ups from this network. Please try again in 60 minutes.' });
    expect(blocked.headers.get('Retry-After')).toBe('3600');
    expect((await signup({ ip: '198.51.100.8' })).status).not.toBe(429);

    // The window ends; the address may try again.
    setClock('2026-11-09T07:00:01Z');
    expect((await signup({ ip: '198.51.100.7' })).status).not.toBe(429);
  });

  test('a made-up X-Forwarded-For does not buy a fresh limit, with or without a trusted proxy', async () => {
    // No TRUST_PROXY (an API reached directly): the header is ignored; the connection address counts.
    await exhaust(10, () => signup({ ip: '198.51.100.7', headers: { 'X-Forwarded-For': `10.0.0.${Math.floor(Math.random() * 250)}` } }));
    expect((await signup({ ip: '198.51.100.7', headers: { 'X-Forwarded-For': '10.9.9.9' } })).status).toBe(429);

    // Behind Caddy (TRUST_PROXY=1): the proxy's own entry, the last one, counts; what the client wrote before it doesn't.
    process.env.TRUST_PROXY = '1';
    resetRateLimits();
    const viaProxy = (client: string, spoof: string) => signup({ ip: '172.18.0.5', headers: { 'X-Forwarded-For': `${spoof}, ${client}` } });
    await exhaust(10, () => viaProxy('203.0.113.50', `10.0.0.${Math.floor(Math.random() * 250)}`));
    expect((await viaProxy('203.0.113.50', '10.1.2.3')).status).toBe(429);
    // A different client behind the same proxy has its own limit.
    expect((await viaProxy('203.0.113.51', '10.1.2.3')).status).not.toBe(429);
  });

  test('IPv6 clients are limited per /64, so rotating addresses inside it does not help', async () => {
    await exhaust(10, () => signup({ ip: `2001:db8:abcd:12::${Math.floor(Math.random() * 9000) + 1}` }));
    expect((await signup({ ip: '2001:db8:abcd:12:ffff::1' })).status).toBe(429);
    expect((await signup({ ip: '2001:db8:abcd:13::1' })).status).not.toBe(429);
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('2001:db8:0:12::1')).toBe('2001:db8:0:12::/64');
  });
});

describe('limits per person', () => {
  test('writes count against the signed-in person, not the address they share', async () => {
    const a = await newTenant('Busy');
    const b = await newTenant('Neighbour');
    // Flags on a review that doesn't exist: each is refused (404) after it is counted.
    const flag = (token: string) => call('/reviews/rev_missing/flag', { token, body: { reason: 'Looks fake' }, ip: '198.51.100.20' });
    await exhaust(60, () => flag(a.token));
    const blocked = await flag(a.token);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe('You are sending a lot in a short time. Please try again in 10 minutes.');
    expect((await flag(b.token)).status).toBe(404);
  });

  test('search and suggestions: per person when signed in, per address otherwise; limits can be set in one place', async () => {
    process.env.RATE_LIMITS = 'search=3/60,suggest=2/60';
    await exhaust(3, () => call('/hostels?q=pg', { ip: '198.51.100.30' }));
    expect((await call('/hostels?q=pg', { ip: '198.51.100.30' })).status).toBe(429);
    const t = await newTenant();
    expect((await call('/hostels?q=pg', { ip: '198.51.100.30', token: t.token })).status).toBe(200);
    await exhaust(2, () => call('/suggest?q=gach', { ip: '198.51.100.30' }));
    expect((await call('/suggest?q=gach', { ip: '198.51.100.30' })).status).toBe(429);
  });
});

describe('page views (owner insights)', () => {
  test('one view per visitor per half hour; the owner looking at their own page does not count; scripts are limited', async () => {
    const ownerToken = await newOwner();
    const adminToken = await admin();
    const { hostel } = await liveHostel(ownerToken, adminToken, { partner: true });
    const view = (opts: { ip?: string; token?: string } = {}) => call(`/hostels/${hostel.slug}/view`, { method: 'POST', ip: '198.51.100.40', ...opts });
    const views = async () => (await call(`/owner/hostels/${hostel.id}/insights`, { token: ownerToken })).body.views30d as number;

    for (let i = 0; i < 5; i++) expect((await view()).status).toBe(200);
    expect(await views()).toBe(1);
    await view({ ip: '198.51.100.41' });
    const reader = await newTenant();
    await view({ token: reader.token });
    await view({ token: reader.token, ip: '198.51.100.99' }); // the same person from another network
    await view({ token: ownerToken });
    expect(await views()).toBe(3);

    setClock('2026-11-09T06:31:00Z');
    await view();
    expect(await views()).toBe(4);

    // Beyond counting once, a script hammering the endpoint is refused.
    process.env.RATE_LIMITS = 'view=5/60';
    resetRateLimits();
    await exhaust(5, () => view({ ip: '198.51.100.50' }));
    expect((await view({ ip: '198.51.100.50' })).status).toBe(429);
  });
});

test('production refuses raised limits, malformed overrides and a TRUST_PROXY that is not 0 or 1', () => {
  const base = {
    NODE_ENV: 'production',
    OTP_PEPPER: 'a'.repeat(40),
    UPLOAD_SIGNING_SECRET: 'b'.repeat(40),
    DATABASE_URL: 'postgres://x',
    API_PUBLIC_URL: 'https://api.example.in',
    WEB_URL: 'https://example.in',
    CORS_ORIGINS: 'https://example.in',
  };
  expect(productionConfigProblems({ ...base, TRUST_PROXY: '1', RATE_LIMITS: 'login=30/600' })).toEqual([]);
  const problems = productionConfigProblems({ ...base, TRUST_PROXY: 'yes', RATE_LIMITS: 'login=30,nope=1/1', RATE_LIMIT_FACTOR: '50' });
  expect(problems).toHaveLength(4);
  expect(problems.join('\n')).toContain('TRUST_PROXY must be 1');
  expect(problems.join('\n')).toContain('RATE_LIMITS entry "login=30"');
  expect(problems.join('\n')).toContain('RATE_LIMITS entry "nope=1/1"');
  expect(problems.join('\n')).toContain('RATE_LIMIT_FACTOR is 50');
});
