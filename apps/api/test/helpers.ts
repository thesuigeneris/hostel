import { sql } from 'drizzle-orm';
import { newId, type Role } from '@hostels/shared';
import { createApp } from '../src/app';
import { db, schema } from '../src/db';

export const app = createApp();

/** Remove all rows from every table. Call in beforeEach. */
export async function truncateAll() {
  const rows = await db.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const names = [...rows].map((r) => `"${r.tablename}"`).join(', ');
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

export type ReqOpts = { token?: string; body?: unknown; headers?: Record<string, string> };

export async function req<T = any>(method: string, path: string, opts: ReqOpts = {}): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let payload: BodyInit | undefined;
  if (opts.body instanceof FormData) payload = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await app.request(path, { method, headers, body: payload });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

let phoneCounter = 0;
export function nextPhone(): string {
  phoneCounter++;
  return `9${String(100000000 + phoneCounter).slice(-9)}`;
}

/** Sign in through the real OTP flow and return the session token + user. */
export async function login(role: Exclude<Role, 'admin'> = 'tenant', phone = nextPhone(), name = 'Test User') {
  await req('POST', '/auth/otp', { body: { phone } });
  const r = await req('POST', '/auth/verify', { body: { phone, otp: '123456', role, name } });
  if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
  return { token: r.body.token as string, user: r.body.user as { id: string; phone: string; role: Role } };
}

/** Admin login (phone 9000000001 is in ADMIN_PHONES during tests). */
export async function loginAdmin() {
  return login('tenant', '9000000001', 'Admin');
}

/** Insert a hostel directly. Defaults: live, verified partner, one 2-sharing room. */
export async function createHostel(
  ownerId: string,
  overrides: Partial<typeof schema.hostels.$inferInsert> = {},
  room: Partial<typeof schema.roomTypes.$inferInsert> = {},
) {
  const id = newId('hst');
  const [hostel] = await db
    .insert(schema.hostels)
    .values({
      id,
      ownerId,
      slug: `test-hostel-${id.slice(4, 12)}`,
      name: 'Test Hostel',
      city: 'Hyderabad',
      area: 'Gachibowli',
      address: '1 Test Road, Gachibowli',
      lat: 17.44,
      lng: 78.35,
      genderType: 'coliving',
      contactPhone: '9876543210',
      foodAvailable: true,
      status: 'live',
      partnerStatus: 'verified',
      ...overrides,
    })
    .returning();
  const [roomType] = await db
    .insert(schema.roomTypes)
    .values({ id: newId('rmt'), hostelId: id, sharing: '2-sharing', monthlyRent: 9000, advanceAmount: 0, totalBeds: 10, bedsAvailable: 5, ...room })
    .returning();
  return { hostel: hostel!, roomType: roomType! };
}
