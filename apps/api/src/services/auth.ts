import type { AuthSession, OtpSent, Role, User } from '@hostels/shared';
import { newId } from '@hostels/shared';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { hmacHex, randomToken, safeEqual, sha256Hex } from '../lib/crypto';
import { env } from '../lib/env';
import { AppError } from '../lib/errors';
import { generateOtp, isMsg91Configured, sendOtp } from '../lib/msg91';
import { toUser } from './mappers';
import { linkInvitedResidencies } from './residents';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const SESSION_TTL_DAYS = 30;

const HOUR_MS = 60 * 60 * 1000;

function hashOtp(phone: string, otp: string) {
  return hmacHex(env.otpPepper, `${phone}:${otp}`);
}

export async function requestOtp(phone: string, now = new Date()): Promise<OtpSent> {
  // Stub mode accepts 123456 for every phone, so it must never serve real users.
  if (env.isProduction && !isMsg91Configured()) {
    throw new AppError('internal', 'SMS login is not configured on this server', 503);
  }
  const db = getDb();
  const otp = generateOtp();
  const codeHash = hashOtp(phone, otp);
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
  const windowCutoff = new Date(now.getTime() - HOUR_MS);
  const t = schema.otpCodes;

  // One atomic upsert: a new code resets attempts; the hourly send counter resets once its window has passed.
  // When the window is still open and the limit is reached, the WHERE fails and no row comes back.
  const windowExpired = sql`${t.sendWindowStart} <= ${windowCutoff.toISOString()}::timestamptz`;
  const rows = await db
    .insert(t)
    .values({ phone, codeHash, expiresAt, attempts: 0, sendWindowStart: now, sendCount: 1 })
    .onConflictDoUpdate({
      target: t.phone,
      set: {
        codeHash,
        expiresAt,
        attempts: 0,
        sendWindowStart: sql`case when ${windowExpired} then ${now.toISOString()}::timestamptz else ${t.sendWindowStart} end`,
        sendCount: sql`case when ${windowExpired} then 1 else ${t.sendCount} + 1 end`,
      },
      setWhere: sql`${windowExpired} or ${t.sendCount} < ${OTP_MAX_SENDS_PER_HOUR}`,
    })
    .returning({ phone: t.phone });
  if (rows.length === 0) {
    throw new AppError('otp_rate_limited', 'Too many OTP requests. Try again in an hour.');
  }

  await sendOtp(phone, otp);
  return { ok: true, expiresInSeconds: OTP_TTL_SECONDS, ...(isMsg91Configured() ? {} : { devOtp: otp }) };
}

export async function verifyOtp(
  input: { phone: string; otp: string; role?: 'tenant' | 'owner'; name?: string },
  now = new Date(),
): Promise<AuthSession> {
  const db = getDb();
  const t = schema.otpCodes;
  const invalid = new AppError('otp_invalid', 'That OTP is wrong or has expired. Request a new one.', 400);

  // Count the attempt first so parallel guesses cannot exceed the limit.
  const [row] = await db
    .update(t)
    .set({ attempts: sql`${t.attempts} + 1` })
    .where(and(eq(t.phone, input.phone), gt(t.expiresAt, now), lt(t.attempts, OTP_MAX_ATTEMPTS)))
    .returning({ codeHash: t.codeHash, attempts: t.attempts });
  if (!row || !safeEqual(row.codeHash, hashOtp(input.phone, input.otp))) throw invalid;

  // Single use: only the request that deletes the code gets a session.
  const consumed = await db
    .delete(t)
    .where(and(eq(t.phone, input.phone), eq(t.codeHash, row.codeHash)))
    .returning({ phone: t.phone });
  if (consumed.length === 0) throw invalid;

  const user = await findOrCreateUser(input.phone, input.role, input.name);
  await linkInvitedResidencies(user);
  return createSession(user.id, now);
}

/** Admin comes only from ADMIN_PHONES. A tenant may upgrade to owner; roles are never downgraded here. */
function resolveRole(phone: string, current: Role | null, requested?: 'tenant' | 'owner'): Role {
  if (env.adminPhones.includes(phone)) return 'admin';
  if (current === 'admin' || current === 'owner') return current;
  if (current === 'tenant') return requested === 'owner' ? 'owner' : 'tenant';
  return requested ?? 'tenant';
}

async function findOrCreateUser(phone: string, requested?: 'tenant' | 'owner', name?: string): Promise<User> {
  const db = getDb();
  const u = schema.users;
  const [existing] = await db.select().from(u).where(eq(u.phone, phone)).limit(1);
  if (existing) {
    const role = resolveRole(phone, existing.role, requested);
    if (role === existing.role) return toUser(existing);
    const [updated] = await db.update(u).set({ role }).where(eq(u.id, existing.id)).returning();
    return toUser(updated!);
  }
  await db
    .insert(u)
    .values({ id: newId('usr'), phone, name: name ?? '', role: resolveRole(phone, null, requested) })
    .onConflictDoNothing({ target: u.phone });
  const [created] = await db.select().from(u).where(eq(u.phone, phone)).limit(1);
  return toUser(created!);
}

export async function createSession(userId: string, now = new Date()): Promise<AuthSession> {
  const db = getDb();
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * HOUR_MS);
  await db.insert(schema.sessions).values({ tokenHash: sha256Hex(token), userId, expiresAt });
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return { user: toUser(user!), token, expiresAt: expiresAt.toISOString() };
}

export async function getSessionUser(token: string, now = new Date()): Promise<User | null> {
  const db = getDb();
  const s = schema.sessions;
  const [row] = await db
    .select({ user: schema.users })
    .from(s)
    .innerJoin(schema.users, eq(schema.users.id, s.userId))
    .where(and(eq(s.tokenHash, sha256Hex(token)), gt(s.expiresAt, now)))
    .limit(1);
  return row ? toUser(row.user) : null;
}

export async function deleteSession(token: string) {
  await getDb().delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256Hex(token)));
}
