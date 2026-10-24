import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db';
import { login, nextPhone, req, truncateAll } from './helpers';

beforeEach(truncateAll);

describe('auth', () => {
  test('health reports stub modes', async () => {
    const r = await req('GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, razorpay: 'stub', msg91: 'stub', storage: 'local' });
  });

  test('otp login creates a tenant and a session', async () => {
    const phone = nextPhone();
    const o = await req('POST', '/auth/otp', { body: { phone: `+91 ${phone}` } });
    expect(o.status).toBe(200);
    expect(o.body.devOtp).toBe('123456');
    const v = await req('POST', '/auth/verify', { body: { phone, otp: '123456', name: 'Asha' } });
    expect(v.status).toBe(200);
    expect(v.body.user).toMatchObject({ phone, role: 'tenant', name: 'Asha' });
    const me = await req('GET', '/me', { token: v.body.token });
    expect(me.body.phone).toBe(phone);
    const [otp] = await db.select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
    expect(otp).toBeUndefined(); // consumed
  });

  test('otp is stored hashed', async () => {
    const phone = nextPhone();
    await req('POST', '/auth/otp', { body: { phone } });
    const [otp] = await db.select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
    expect(otp!.codeHash).not.toContain('123456');
    expect(otp!.codeHash).toHaveLength(64);
  });

  test('wrong code counts attempts and locks after 5', async () => {
    const phone = nextPhone();
    await req('POST', '/auth/otp', { body: { phone } });
    for (let i = 0; i < 5; i++) {
      const r = await req('POST', '/auth/verify', { body: { phone, otp: '000000' } });
      expect(r.body.error).toBe('otp_invalid');
    }
    const r = await req('POST', '/auth/verify', { body: { phone, otp: '123456' } });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('otp_rate_limited');
  });

  test('max 5 sends per hour', async () => {
    const phone = nextPhone();
    for (let i = 0; i < 5; i++) expect((await req('POST', '/auth/otp', { body: { phone } })).status).toBe(200);
    const r = await req('POST', '/auth/otp', { body: { phone } });
    expect(r.status).toBe(429);
  });

  test('admin role cannot be requested; ADMIN_PHONES grants it', async () => {
    const phone = nextPhone();
    await req('POST', '/auth/otp', { body: { phone } });
    const bad = await req('POST', '/auth/verify', { body: { phone, otp: '123456', role: 'admin' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('validation');

    await req('POST', '/auth/otp', { body: { phone: '9000000001' } });
    const ok = await req('POST', '/auth/verify', { body: { phone: '9000000001', otp: '123456' } });
    expect(ok.body.user.role).toBe('admin');
  });

  test('tenant signing in as owner is upgraded', async () => {
    const phone = nextPhone();
    await login('tenant', phone);
    const { user } = await login('owner', phone);
    expect(user.role).toBe('owner');
  });

  test('invalid phone is rejected', async () => {
    const r = await req('POST', '/auth/otp', { body: { phone: '12345' } });
    expect(r.status).toBe(400);
    expect(r.body.issues[0].path).toBe('phone');
  });

  test('logout ends the session; expired sessions are rejected', async () => {
    const { token } = await login();
    expect((await req('POST', '/auth/logout', { token })).status).toBe(200);
    expect((await req('GET', '/me', { token })).status).toBe(401);

    const s2 = await login();
    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.sessions.token, s2.token));
    expect((await req('GET', '/me', { token: s2.token })).status).toBe(401);
  });

  test('PATCH /me updates name and email', async () => {
    const { token } = await login();
    const r = await req('PATCH', '/me', { token, body: { name: 'Ravi', email: 'ravi@example.com' } });
    expect(r.body).toMatchObject({ name: 'Ravi', email: 'ravi@example.com' });
  });

  test('unknown route returns not_found json', async () => {
    const r = await req('GET', '/nope');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('not_found');
  });
});
