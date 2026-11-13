import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { assertResetAllowed } from '../src/db/seed';
import { setClock } from '../src/lib/clock';
import { hmacHex } from '../src/lib/crypto';
import { grantAdmin } from '../src/services/auth';
import { admin, liveHostel, newOwner, nextPhone } from './fixtures';
import { call, login, resetDb } from './helpers';

const GOOD = 'a quiet room near the lake';
const OTHER = 'mango trees by the window';

/** Run with some env vars set, restoring them afterwards (env is read lazily by the API). */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
const production = { NODE_ENV: 'production', APP_MODE: undefined };
const demoInstance = { NODE_ENV: 'production', APP_MODE: 'demo' };

async function register(phone = nextPhone(), password = GOOD, extra: Record<string, unknown> = {}) {
  return call('/auth/register', { body: { phone, password, name: 'Asha Rao', ...extra } });
}

async function makeDemo(phone: string) {
  await getDb().update(schema.users).set({ isDemo: true }).where(eq(schema.users.phone, phone));
}

beforeEach(async () => {
  await resetDb();
  setClock('2026-11-09T06:00:00Z');
});
afterEach(() => setClock(null));

describe('auth modes', () => {
  test('password sign-up and login work in production without SMS', async () => {
    await withEnv(production, async () => {
      const methods = await call('/auth/methods');
      expect(methods.body).toEqual({ mode: 'standard', otp: 'off', password: true, signup: true, demo: { enabled: false, accounts: [] } });
      expect((await call('/auth/otp', { body: { phone: nextPhone() } })).body.error).toBe('method_disabled');

      const phone = nextPhone();
      const reg = await register(`+91 ${phone}`, GOOD, { role: 'owner' });
      expect(reg.status).toBe(201);
      expect(reg.body.user).toMatchObject({ phone, role: 'owner', phoneVerified: false, hasPassword: true, isDemo: false });
      expect(JSON.stringify(reg.body)).not.toContain('argon2');
      expect((await call('/me', { token: reg.body.token })).body.phone).toBe(phone);

      const again = await call('/auth/login', { body: { phone, password: GOOD } });
      expect(again.status).toBe(200);
      expect(again.body.user.id).toBe(reg.body.user.id);

      // Never attach a password to an existing account.
      const dup = await register(phone, OTHER);
      expect(dup.status).toBe(409);
      expect(dup.body.error).toBe('signup_failed');
    });
  });

  test('login errors are generic', async () => {
    const known = nextPhone();
    await register(known);
    const demo = nextPhone();
    await register(demo);
    await makeDemo(demo);
    await withEnv(production, async () => {
      const wrong = await call('/auth/login', { body: { phone: known, password: OTHER } });
      const unknown = await call('/auth/login', { body: { phone: nextPhone(), password: OTHER } });
      const blockedDemo = await call('/auth/login', { body: { phone: demo, password: GOOD } });
      for (const r of [wrong, unknown, blockedDemo]) {
        expect(r.status).toBe(401);
        expect(r.body).toEqual({ error: 'invalid_credentials', message: 'Phone number or password is wrong.' });
      }
    });
  });

  test('throttles per phone, for known and unknown phones alike', async () => {
    const phone = nextPhone();
    await register(phone);
    for (const p of [phone, nextPhone()]) {
      for (let i = 0; i < 5; i++) expect((await call('/auth/login', { body: { phone: p, password: OTHER } })).status).toBe(401);
      const sixth = await call('/auth/login', { body: { phone: p, password: GOOD } });
      expect(sixth.status).toBe(429);
      expect(sixth.body.error).toBe('login_locked');
    }
    // Locked for 15 minutes from the 5th attempt, then a correct password works and clears the counter.
    setClock('2026-11-09T06:14:59Z');
    expect((await call('/auth/login', { body: { phone, password: GOOD } })).status).toBe(429);
    setClock('2026-11-09T06:15:00Z');
    expect((await call('/auth/login', { body: { phone, password: GOOD } })).status).toBe(200);
    const [row] = await getDb().select().from(schema.loginThrottle).where(eq(schema.loginThrottle.phone, phone));
    expect(row).toBeUndefined();
    // Success reset the count: 4 more wrong tries are not locked.
    for (let i = 0; i < 4; i++) expect((await call('/auth/login', { body: { phone, password: OTHER } })).status).toBe(401);
    expect((await call('/auth/login', { body: { phone, password: GOOD } })).status).toBe(200);
  });

  test('throttle holds under parallel guesses', async () => {
    const phone = nextPhone();
    await register(phone);
    const results = await Promise.all(Array.from({ length: 12 }, () => call('/auth/login', { body: { phone, password: OTHER } })));
    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(7);
  });

  test('password policy', async () => {
    const phone = nextPhone();
    const short = await register(phone, 'tooshort');
    expect(short.status).toBe(400);
    expect(short.body.issues[0]).toMatchObject({ path: 'password' });
    expect((await register(phone, 'PasswordPassword')).body.issues[0].message).toContain('too common');
    expect((await register(phone, `my phone ${phone} ok`)).body.issues[0].message).toContain('phone');
    expect((await register(phone, 'x'.repeat(10) + 'y'.repeat(119))).status).toBe(400); // 129 chars
    expect((await register(phone, 'rain on the hil')).status).toBe(201); // exactly 15
  });

  test('demo login isolation', async () => {
    const demoPhone = nextPhone();
    await login(demoPhone);
    await makeDemo(demoPhone);
    const realPhone = nextPhone();
    await login(realPhone);

    // Development: demo accounts only.
    expect((await call('/auth/demo', { body: { phone: demoPhone } })).status).toBe(200);
    expect((await call('/auth/demo', { body: { phone: realPhone } })).body.error).toBe('invalid_credentials');
    expect((await call('/auth/demo', { body: { phone: nextPhone() } })).body.error).toBe('invalid_credentials');
    const methods = await call('/auth/methods');
    expect(methods.body.demo).toEqual({ enabled: true, accounts: [{ phone: demoPhone, name: '', role: 'tenant' }] });

    await withEnv({ DEMO_LOGIN: 'off' }, async () => {
      expect((await call('/auth/demo', { body: { phone: demoPhone } })).body.error).toBe('method_disabled');
    });
    // Production standard: never, by any method.
    await withEnv({ ...production, DEMO_LOGIN: 'on' }, async () => {
      expect((await call('/auth/demo', { body: { phone: demoPhone } })).body.error).toBe('method_disabled');
      expect((await call('/auth/methods')).body.demo).toEqual({ enabled: false, accounts: [] });
    });
  });

  test('demo mode instance: only demo accounts, no sign-up, no SMS, simulated payments allowed', async () => {
    // Build a hostel and a demo tenant in dev mode, then switch the instance to demo + production.
    const ownerToken = await newOwner();
    const adminToken = await admin();
    const { hostel, rooms } = await liveHostel(ownerToken, adminToken, { partner: true });
    const tenantPhone = nextPhone();
    const realToken = await login(nextPhone());
    await login(tenantPhone);
    await makeDemo(tenantPhone);

    await withEnv(demoInstance, async () => {
      expect((await call('/auth/methods')).body).toMatchObject({ mode: 'demo', otp: 'off', password: false, signup: false, demo: { enabled: true } });
      expect((await register()).body.error).toBe('method_disabled');
      expect((await call('/auth/login', { body: { phone: tenantPhone, password: GOOD } })).body.error).toBe('method_disabled');
      expect((await call('/auth/otp', { body: { phone: tenantPhone } })).body.error).toBe('method_disabled');
      // A real person's session from before is not accepted on a demo instance.
      expect((await call('/me', { token: realToken })).status).toBe(401);

      const session = await call('/auth/demo', { body: { phone: tenantPhone } });
      expect(session.status).toBe(200);
      const sub = await call(`/hostels/${hostel.id}/subscribe`, { token: session.body.token, body: { roomTypeId: rooms[0].id, mealPlan: 'full', diet: 'veg' } });
      expect(sub.status).toBe(201);
      const paid = await call(`/payments/${sub.body.invoice.id}/simulate`, { token: session.body.token, method: 'POST' });
      expect(paid.status).toBe(200);
      expect(paid.body.invoice.status).toBe('paid');
    });
  });

  test('a demo instance ignores correctly signed payment webhooks, so real payment events never mark demo bills paid', async () => {
    const ownerToken = await newOwner();
    const { hostel, rooms } = await liveHostel(ownerToken, await admin(), { partner: true });
    const phone = nextPhone();
    await login(phone);
    await makeDemo(phone);
    const webhook = (orderId: string) => {
      const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_${orderId}`, order_id: orderId } } } });
      return call('/webhooks/razorpay', { body, headers: { 'x-razorpay-signature': hmacHex('test-webhook-secret', body) } });
    };

    await withEnv(demoInstance, async () => {
      const session = await call('/auth/demo', { body: { phone } });
      const sub = await call(`/hostels/${hostel.id}/subscribe`, { token: session.body.token, body: { roomTypeId: rooms[0].id, mealPlan: 'full', diet: 'veg' } });
      expect(sub.status).toBe(201);
      const hook = await webhook(sub.body.invoice.razorpayOrderId);
      expect(hook.status).toBe(400);
      expect(hook.body.error).toBe('signature_invalid');
      expect((await call('/me/subscription', { token: session.body.token })).body.subscription.status).toBe('pending');
    });

    // Control: the same signed event is accepted on a standard instance, so the refusal above is the demo rule.
    const tenant = await login(nextPhone());
    const sub = await call(`/hostels/${hostel.id}/subscribe`, { token: tenant, body: { roomTypeId: rooms[0].id, mealPlan: 'full', diet: 'veg' } });
    expect((await webhook(sub.body.invoice.razorpayOrderId)).status).toBe(200);
    expect((await call('/me/subscription', { token: tenant })).body.subscription.status).toBe('active');
  });

  test('isolation applies to every session path: existing sessions and app-to-web handoff', async () => {
    const phone = nextPhone();
    const token = await login(phone);
    await makeDemo(phone);
    const handoff = await call('/auth/handoff', { token, method: 'POST' });
    expect(handoff.status).toBe(201);
    await withEnv(production, async () => {
      expect((await call('/me', { token })).status).toBe(401);
      const redeemed = await call('/auth/handoff/redeem', { body: { code: handoff.body.code } });
      expect(redeemed.status).toBe(401);
      expect(redeemed.body.error).toBe('invalid_credentials');
    });
    // Back in development the same session works again: nothing was deleted, only refused.
    expect((await call('/me', { token })).status).toBe(200);
  });

  test('invites need a verified phone', async () => {
    const ownerToken = await newOwner();
    const adminToken = await admin();
    const { hostel } = await liveHostel(ownerToken, adminToken);
    await call(`/owner/hostels/${hostel.id}/plan`, { token: ownerToken, body: { plan: 'pro' } });
    const phone = nextPhone();
    const added = await call(`/owner/hostels/${hostel.id}/residents`, {
      token: ownerToken,
      body: { phone, name: 'Ravi', monthlyRent: 7000, startDate: '2026-10-01' },
    });
    expect(added.body.status).toBe('invited');

    // Someone signs up with that phone and a password: they prove nothing about the phone, so no invite.
    const reg = await register(phone);
    expect((await call('/me/residencies', { token: reg.body.token })).body).toEqual([]);

    // The phone's holder verifies by OTP: same account, now verified, and the invite appears.
    const otpToken = await login(phone);
    const me = await call('/me', { token: otpToken });
    expect(me.body).toMatchObject({ id: reg.body.user.id, phoneVerified: true, hasPassword: true });
    const stays = await call('/me/residencies', { token: otpToken });
    expect(stays.body[0]).toMatchObject({ status: 'invited', hostel: { id: hostel.id } });
  });

  test('admin needs a verified phone or the server script', async () => {
    // 9000000001 is in ADMIN_PHONES for tests. A password sign-up with it must not become admin.
    const reg = await register('9000000001');
    expect(reg.body.user).toMatchObject({ role: 'tenant', phoneVerified: false });
    expect((await call('/admin/stats', { token: reg.body.token })).status).toBe(403);

    const granted = await grantAdmin('9000000001');
    expect(granted.role).toBe('admin');
    expect((await call('/admin/stats', { token: reg.body.token })).status).toBe(200);
    await expect(grantAdmin(nextPhone())).rejects.toThrow('No account');
  });

  test('ADMIN_PHONES applies after OTP verification of a password account', async () => {
    const reg = await register('9000000001');
    expect(reg.body.user.role).toBe('tenant');
    const otpToken = await login('9000000001');
    expect((await call('/me', { token: otpToken })).body).toMatchObject({ role: 'admin', phoneVerified: true });
  });

  test('password change: needs the current password, revokes other sessions; OTP accounts can set a first one', async () => {
    const phone = nextPhone();
    const first = await register(phone);
    const second = await call('/auth/login', { body: { phone, password: GOOD } });

    const wrong = await call('/me/password', { token: first.body.token, body: { currentPassword: OTHER, newPassword: 'sunlight on the stairs' } });
    expect(wrong.status).toBe(401);
    expect((await call('/me/password', { token: first.body.token, body: { newPassword: 'sunlight on the stairs' } })).status).toBe(401);
    const weak = await call('/me/password', { token: first.body.token, body: { currentPassword: GOOD, newPassword: 'short' } });
    expect(weak.status).toBe(400);

    const ok = await call('/me/password', { token: first.body.token, body: { currentPassword: GOOD, newPassword: 'sunlight on the stairs' } });
    expect(ok.body).toEqual({ ok: true });
    expect((await call('/me', { token: second.body.token })).status).toBe(401);
    expect((await call('/me', { token: first.body.token })).status).toBe(200);
    expect((await call('/auth/login', { body: { phone, password: GOOD } })).status).toBe(401);
    expect((await call('/auth/login', { body: { phone, password: 'sunlight on the stairs' } })).status).toBe(200);

    const otpOnly = await login(nextPhone());
    expect((await call('/me/password', { token: otpOnly, body: { newPassword: 'blue door green gate' } })).body).toEqual({ ok: true });
    expect((await call('/me', { token: otpOnly })).body.hasPassword).toBe(true);

    const demoPhone = nextPhone();
    const demoToken = await login(demoPhone);
    await makeDemo(demoPhone);
    expect((await call('/me/password', { token: demoToken, body: { newPassword: 'blue door green gate' } })).body.error).toBe('method_disabled');
  });

  test('seed reset guard', () => {
    expect(() => assertResetAllowed('production', undefined)).toThrow('Refusing to reset');
    expect(() => assertResetAllowed('production', 'standard')).toThrow('Refusing to reset');
    expect(() => assertResetAllowed('production', 'demo')).not.toThrow();
    expect(() => assertResetAllowed('development', undefined)).not.toThrow();
    expect(() => assertResetAllowed('test', undefined)).not.toThrow();
  });
});
