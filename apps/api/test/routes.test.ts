import { beforeAll, describe, expect, test } from 'bun:test';
import { getDb } from '../src/db';
import { seed } from '../src/db/seed';
import { call, login, resetDb } from './helpers';

let tokens: { admin: string; owner: string; tenant: string };

beforeAll(async () => {
  await resetDb();
  await seed(getDb(), '2026-10-24');
  tokens = {
    admin: await login('9000000001'),
    owner: await login('9000000002'),
    tenant: await login('9000000003'),
  };
});

describe('health', () => {
  test('reports stub mode and the database', async () => {
    const res = await call('/');
    expect(res.body).toMatchObject({ ok: true, db: 'up', razorpay: 'stub', msg91: 'stub', devMode: true });
  });
});

describe('seed', () => {
  test('12 live hostels, 6 verified partners, seeded roles', async () => {
    const res = await call('/hostels?limit=50');
    expect(res.body.total).toBe(12);
    expect(res.body.items.filter((h: { isVerified: boolean }) => h.isVerified)).toHaveLength(6);
    expect((await call('/me', { token: tokens.admin })).body.role).toBe('admin');
    expect((await call('/me', { token: tokens.owner })).body.role).toBe('owner');
    expect((await call('/me', { token: tokens.tenant })).body.role).toBe('tenant');
  });

  test('hostel detail has photos, rooms and no advance for partners', async () => {
    const res = await call('/hostels/sunrise-residency-gachibowli');
    expect(res.status).toBe(200);
    expect(res.body.isVerified).toBe(true);
    expect(res.body.photos).toHaveLength(3);
    expect(res.body.roomTypes.every((r: { advanceAmount: number }) => r.advanceAmount === 0)).toBe(true);
    expect((await call('/hostels/nope')).status).toBe(404);
  });
});

describe('role guards', () => {
  test('owner routes', async () => {
    expect((await call('/owner/hostels')).status).toBe(401);
    expect((await call('/owner/hostels', { token: tokens.tenant })).status).toBe(403);
    const own = await call('/owner/hostels', { token: tokens.owner });
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(6);
  });

  test('admin routes', async () => {
    expect((await call('/admin/hostels', { token: tokens.owner })).status).toBe(403);
    expect((await call('/admin/hostels', { token: tokens.tenant })).status).toBe(403);
    const all = await call('/admin/hostels?status=live', { token: tokens.admin });
    expect(all.body).toHaveLength(12);
    expect((await call('/admin/hostels?status=bogus', { token: tokens.admin })).status).toBe(400);
  });

  test('tenant routes', async () => {
    expect((await call('/me/subscription', { token: tokens.owner })).status).toBe(403);
    const sub = await call('/me/subscription', { token: tokens.tenant });
    expect(sub.status).toBe(200);
    expect(sub.body.subscription.status).toBe('active');
  });
});

describe('errors', () => {
  test('unknown route and bad JSON use the error shape', async () => {
    expect(await call('/nope')).toEqual({ status: 404, body: { error: 'not_found', message: 'Route not found' } });
    const bad = await call('/auth/otp', { body: '{not json' });
    expect(bad).toEqual({ status: 400, body: { error: 'validation', message: 'Request body must be JSON' } });
  });
});
