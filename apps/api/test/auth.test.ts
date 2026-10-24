import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { sha256Hex } from '../src/lib/crypto';
import { requestOtp, verifyOtp } from '../src/services/auth';
import { call, login, resetDb } from './helpers';

beforeEach(resetDb);

describe('OTP login', () => {
  test('stub mode returns the dev OTP and stores only a hash', async () => {
    const res = await call('/auth/otp', { body: { phone: '+91 98765 43210' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, expiresInSeconds: 300, devOtp: '123456' });
    const [row] = await getDb().select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, '9876543210'));
    expect(row!.codeHash).not.toContain('123456');
    expect(row!.codeHash).toHaveLength(64);
  });

  test('invalid phone is a validation error', async () => {
    const res = await call('/auth/otp', { body: { phone: '12345' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
    expect(res.body.issues[0].path).toBe('phone');
  });

  test('verify creates a tenant with a 30-day session, and the token works', async () => {
    await call('/auth/otp', { body: { phone: '9876543210' } });
    const res = await call('/auth/verify', { body: { phone: '9876543210', otp: '123456', name: 'Asha' } });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ phone: '9876543210', role: 'tenant', name: 'Asha' });
    expect(res.body.token.length).toBeGreaterThanOrEqual(43);
    const days = (Date.parse(res.body.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);

    const me = await call('/me', { token: res.body.token });
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(res.body.user.id);

    // The raw token is never stored.
    const sessions = await getDb().select().from(schema.sessions);
    expect(sessions[0]!.tokenHash).toBe(sha256Hex(res.body.token));
  });

  test('an OTP is single use', async () => {
    await call('/auth/otp', { body: { phone: '9876543210' } });
    expect((await call('/auth/verify', { body: { phone: '9876543210', otp: '123456' } })).status).toBe(200);
    const again = await call('/auth/verify', { body: { phone: '9876543210', otp: '123456' } });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('otp_invalid');
  });

  test('wrong code counts toward a 5-attempt limit, after which even the right code fails', async () => {
    await call('/auth/otp', { body: { phone: '9876543210' } });
    for (let i = 0; i < 5; i++) {
      const r = await call('/auth/verify', { body: { phone: '9876543210', otp: '000000' } });
      expect(r.body.error).toBe('otp_invalid');
    }
    const right = await call('/auth/verify', { body: { phone: '9876543210', otp: '123456' } });
    expect(right.status).toBe(400);
  });

  test('parallel guesses cannot exceed the attempt limit', async () => {
    await requestOtp('9876543210');
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => verifyOtp({ phone: '9876543210', otp: '000000' })),
    );
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    const [row] = await getDb().select().from(schema.otpCodes);
    expect(row!.attempts).toBe(5);
  });

  test('expired OTP is rejected', async () => {
    const past = new Date(Date.now() - 6 * 60 * 1000);
    await requestOtp('9876543210', past);
    const res = await call('/auth/verify', { body: { phone: '9876543210', otp: '123456' } });
    expect(res.body.error).toBe('otp_invalid');
  });

  test('at most 5 sends per phone per hour; the window then resets', async () => {
    const start = new Date('2026-10-24T10:00:00Z');
    for (let i = 0; i < 5; i++) await requestOtp('9876543210', new Date(start.getTime() + i * 60_000));
    await expect(requestOtp('9876543210', new Date(start.getTime() + 10 * 60_000))).rejects.toMatchObject({
      code: 'otp_rate_limited',
    });
    await requestOtp('9876543210', new Date(start.getTime() + 61 * 60_000));

    const res = await call('/auth/otp', { body: { phone: '9123456789' } });
    expect(res.status).toBe(200);
  });

  test('rate-limited response is 429', async () => {
    for (let i = 0; i < 5; i++) await call('/auth/otp', { body: { phone: '9876543210' } });
    const res = await call('/auth/otp', { body: { phone: '9876543210' } });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('otp_rate_limited');
  });
});

describe('roles', () => {
  test('signup can choose owner but never admin', async () => {
    await call('/auth/otp', { body: { phone: '9876543210' } });
    const admin = await call('/auth/verify', { body: { phone: '9876543210', otp: '123456', role: 'admin' } });
    expect(admin.status).toBe(400);
    const token = await login('9876543210', 'owner');
    expect((await call('/me', { token })).body.role).toBe('owner');
  });

  test('ADMIN_PHONES get admin, whatever role they ask for', async () => {
    const token = await login('9000000001', 'tenant');
    expect((await call('/me', { token })).body.role).toBe('admin');
  });

  test('removing a phone from ADMIN_PHONES takes admin away from old and new sessions', async () => {
    const old = await login('9000000001');
    const saved = process.env.ADMIN_PHONES;
    process.env.ADMIN_PHONES = '';
    try {
      expect((await call('/admin/hostels', { token: old })).status).toBe(403);
      expect((await call('/me', { token: old })).body.role).toBe('owner');
      const fresh = await login('9000000001');
      expect((await call('/admin/hostels', { token: fresh })).status).toBe(403);
      expect((await call('/me', { token: fresh })).body.role).toBe('owner');
    } finally {
      process.env.ADMIN_PHONES = saved;
    }
    const back = await login('9000000001');
    expect((await call('/me', { token: back })).body.role).toBe('admin');
  });

  test('an existing owner is not downgraded by logging in as tenant', async () => {
    await login('9876543210', 'owner');
    const token = await login('9876543210', 'tenant');
    expect((await call('/me', { token })).body.role).toBe('owner');
  });

  test('a tenant can upgrade to owner', async () => {
    await login('9876543210');
    const token = await login('9876543210', 'owner');
    expect((await call('/me', { token })).body.role).toBe('owner');
  });
});

describe('sessions', () => {
  test('missing, malformed, unknown and expired tokens are unauthorized', async () => {
    expect((await call('/me')).status).toBe(401);
    expect((await call('/me', { headers: { Authorization: 'Token abc' } })).status).toBe(401);
    expect((await call('/me', { token: 'nope' })).status).toBe(401);

    const token = await login('9876543210');
    await getDb().update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await call('/me', { token });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized', message: 'Sign in to continue' });
  });

  test('logout ends the session', async () => {
    const token = await login('9876543210');
    expect((await call('/auth/logout', { token, method: 'POST' })).status).toBe(200);
    expect((await call('/me', { token })).status).toBe(401);
  });

  test('PATCH /me updates name and email, validating email', async () => {
    const token = await login('9876543210');
    const ok = await call('/me', { token, method: 'PATCH', body: { name: 'Ravi', email: 'ravi@example.com' } });
    expect(ok.body).toMatchObject({ name: 'Ravi', email: 'ravi@example.com', role: 'tenant' });
    const bad = await call('/me', { token, method: 'PATCH', body: { email: 'not-an-email' } });
    expect(bad.status).toBe(400);
    // role is not patchable
    const sneaky = await call('/me', { token, method: 'PATCH', body: { role: 'admin' } });
    expect(sneaky.body.role).toBe('tenant');
  });
});
