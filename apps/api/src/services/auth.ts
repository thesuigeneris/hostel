import { and, count, eq, gt } from 'drizzle-orm';
import { newId } from '@hostels/shared';
import { db, schema } from '../db';
import { randomToken, safeEqual, sha256 } from '../lib/crypto';
import { adminPhones } from '../lib/env';
import { err } from '../lib/http';
import { generateOtp, isMsg91Configured, sendOtp } from '../lib/msg91';
import type { UserRow } from '../lib/types';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashOtp = (phone: string, code: string) => sha256(`${phone}:${code}`);

export async function requestOtp(phone: string): Promise<{ devOtp?: string }> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.otpSends)
    .where(and(eq(schema.otpSends.phone, phone), gt(schema.otpSends.sentAt, hourAgo)));
  if (n >= OTP_MAX_SENDS_PER_HOUR) throw err.domain('otp_rate_limited', 'Too many OTP requests. Try again in an hour.', 429);

  const code = generateOtp();
  const row = { phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 };
  await db.insert(schema.otpCodes).values(row).onConflictDoUpdate({ target: schema.otpCodes.phone, set: row });
  await db.insert(schema.otpSends).values({ id: newId('otp'), phone });
  await sendOtp(phone, code);
  return isMsg91Configured() ? {} : { devOtp: code };
}

export async function verifyOtp(input: {
  phone: string;
  otp: string;
  role?: 'tenant' | 'owner';
  name?: string;
}): Promise<{ user: UserRow; token: string; expiresAt: Date }> {
  const [row] = await db.select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, input.phone));
  if (!row || row.expiresAt.getTime() < Date.now()) throw err.domain('otp_invalid', 'That code has expired. Request a new one.');
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw err.domain('otp_rate_limited', 'Too many wrong attempts. Request a new code.', 429);
  if (!safeEqual(row.codeHash, hashOtp(input.phone, input.otp))) {
    await db
      .update(schema.otpCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(schema.otpCodes.phone, input.phone));
    throw err.domain('otp_invalid', 'Incorrect code');
  }
  await db.delete(schema.otpCodes).where(eq(schema.otpCodes.phone, input.phone));

  const isAdmin = adminPhones().includes(input.phone);
  let [user] = await db.select().from(schema.users).where(eq(schema.users.phone, input.phone));
  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({ id: newId('usr'), phone: input.phone, name: input.name ?? '', role: isAdmin ? 'admin' : (input.role ?? 'tenant') })
      .returning();
  } else if (isAdmin && user.role !== 'admin') {
    [user] = await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, user.id)).returning();
  } else if (input.role === 'owner' && user.role === 'tenant') {
    // A tenant signing in through the owner flow becomes an owner; owners keep tenant abilities.
    [user] = await db.update(schema.users).set({ role: 'owner' }).where(eq(schema.users.id, user.id)).returning();
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({ token, userId: user!.id, expiresAt });
  return { user: user!, token, expiresAt };
}

export async function logout(token: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
}
