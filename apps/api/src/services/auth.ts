import type { AuthMethods, AuthSession, OtpSent, Role, User } from '@hostels/shared';
import { newId, passwordProblem } from '@hostels/shared';
import { and, asc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { hmacHex, randomToken, safeEqual, sha256Hex } from '../lib/crypto';
import { env } from '../lib/env';
import { AppError } from '../lib/errors';
import { clock } from '../lib/clock';
import { generateOtp, isMsg91Configured, otpMode, sendOtp } from '../lib/msg91';
import { toUser } from './mappers';
import { linkInvitedResidencies } from './residents';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const SESSION_TTL_DAYS = 30;
export const HANDOFF_TTL_SECONDS = 120;
/** Password login throttle, per phone: 5 attempts, then locked for 15 minutes (OWASP: count per account). */
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 15;

const HOUR_MS = 60 * 60 * 1000;

function hashOtp(phone: string, otp: string) {
  return hmacHex(env.otpPepper, `${phone}:${otp}`);
}

export async function requestOtp(phone: string, now = new Date()): Promise<OtpSent> {
  // Stub mode accepts 123456 for every phone, so it must never serve real users; demo instances send no SMS.
  if (otpMode() === 'off') throw methodDisabled('Text-message login isn’t available here. Log in with your password.');
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
  if (otpMode() === 'off') throw methodDisabled('Text-message login isn’t available here. Log in with your password.');
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

  // A verified OTP proves the person holds this phone.
  const user = await findOrCreateUser(input.phone, input.role, input.name, { verifiedAt: now });
  await linkInvitedResidencies(user);
  return createSession(user.id, now);
}

/**
 * Admin comes only from ADMIN_PHONES, and only for a phone verified by OTP (a password sign-up proves nothing about
 * the phone). A tenant may upgrade to owner; roles are never downgraded here.
 */
function resolveRole(phone: string, current: Role | null, phoneVerified: boolean, requested?: 'tenant' | 'owner'): Role {
  if (phoneVerified && env.adminPhones.includes(phone)) return 'admin';
  if (current === 'admin' || current === 'owner') return current;
  if (current === 'tenant') return requested === 'owner' ? 'owner' : 'tenant';
  return requested ?? 'tenant';
}

async function findOrCreateUser(
  phone: string,
  requested: 'tenant' | 'owner' | undefined,
  name: string | undefined,
  opts: { verifiedAt: Date },
): Promise<User> {
  const db = getDb();
  const u = schema.users;
  const [existing] = await db.select().from(u).where(eq(u.phone, phone)).limit(1);
  if (existing) {
    const role = resolveRole(phone, existing.role, true, requested);
    if (role === existing.role && existing.phoneVerifiedAt) return toUser(existing);
    const [updated] = await db
      .update(u)
      .set({ role, phoneVerifiedAt: existing.phoneVerifiedAt ?? opts.verifiedAt })
      .where(eq(u.id, existing.id))
      .returning();
    return toUser(updated!);
  }
  await db
    .insert(u)
    .values({ id: newId('usr'), phone, name: name ?? '', role: resolveRole(phone, null, true, requested), phoneVerifiedAt: opts.verifiedAt })
    .onConflictDoNothing({ target: u.phone });
  const [created] = await db.select().from(u).where(eq(u.phone, phone)).limit(1);
  return toUser(created!);
}

const methodDisabled = (message: string) => new AppError('method_disabled', message, 403);
const badCredentials = () => new AppError('invalid_credentials', 'Phone number or password is wrong.', 401);

/**
 * The one place demo isolation is enforced. Every session is created and looked up through here:
 * a production standard instance never admits a demo account, and a demo instance admits nothing else.
 */
export function loginAllowed(user: { isDemo: boolean }): boolean {
  if (env.appMode === 'demo') return user.isDemo;
  return !(env.isProduction && user.isDemo);
}

export async function createSession(userId: string, now = new Date()): Promise<AuthSession> {
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  // Same generic error as a wrong password, so blocked demo accounts are indistinguishable.
  if (!user || !loginAllowed(user)) throw badCredentials();
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * HOUR_MS);
  await db.insert(schema.sessions).values({ tokenHash: sha256Hex(token), userId, expiresAt });
  return { user: toUser(user), token, expiresAt: expiresAt.toISOString() };
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
  // Sessions issued before a mode change stop working too.
  return row && loginAllowed(row.user) ? toUser(row.user) : null;
}

export async function deleteSession(token: string) {
  await getDb().delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256Hex(token)));
}

/** A short-lived, single-use code the app passes to the website so the person lands there signed in. */
export async function createHandoff(userId: string, now = new Date()) {
  const code = randomToken(24);
  await getDb()
    .insert(schema.loginHandoffs)
    .values({ codeHash: sha256Hex(code), userId, expiresAt: new Date(now.getTime() + HANDOFF_TTL_SECONDS * 1000) });
  return { code, expiresInSeconds: HANDOFF_TTL_SECONDS };
}

export async function redeemHandoff(code: string, now = new Date()): Promise<AuthSession> {
  const h = schema.loginHandoffs;
  const [row] = await getDb()
    .update(h)
    .set({ usedAt: now })
    .where(and(eq(h.codeHash, sha256Hex(code)), isNull(h.usedAt), gt(h.expiresAt, now)))
    .returning({ userId: h.userId });
  if (!row) throw new AppError('unauthorized', 'This link has expired. Open it again from the app.', 401);
  return createSession(row.userId, now);
}

// --- password login (no SMS needed) -----------------------------------------------------------------

let dummyHash: Promise<string> | null = null;
/** Verifying against this keeps the response time the same whether or not the phone has an account. */
function dummyPasswordHash() {
  dummyHash ??= Bun.password.hash('not-a-real-password-just-for-timing');
  return dummyHash;
}

/**
 * Takes one login attempt slot for this phone, known or not. Returns false when the phone is locked.
 * One atomic upsert: the window resets after 15 minutes; the 5th attempt in a window sets the lock, so parallel
 * guesses can't exceed 5 attempts per window.
 */
async function takeLoginAttempt(phone: string, now: Date): Promise<boolean> {
  const t = schema.loginThrottle;
  const cutoff = new Date(now.getTime() - LOGIN_LOCK_MINUTES * 60_000).toISOString();
  const lockUntil = new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000).toISOString();
  const expired = sql`${t.windowStart} <= ${cutoff}::timestamptz`;
  const next = sql`case when ${expired} then 1 else ${t.failures} + 1 end`;
  const rows = await getDb()
    .insert(t)
    .values({ phone, failures: 1, windowStart: now, lockedUntil: null })
    .onConflictDoUpdate({
      target: t.phone,
      set: {
        failures: next,
        windowStart: sql`case when ${expired} then ${now.toISOString()}::timestamptz else ${t.windowStart} end`,
        lockedUntil: sql`case when ${next} >= ${LOGIN_MAX_ATTEMPTS} then ${lockUntil}::timestamptz else null end`,
      },
      setWhere: sql`${t.lockedUntil} is null or ${t.lockedUntil} <= ${now.toISOString()}::timestamptz`,
    })
    .returning({ phone: t.phone });
  return rows.length > 0;
}

async function clearLoginAttempts(phone: string) {
  await getDb().delete(schema.loginThrottle).where(eq(schema.loginThrottle.phone, phone));
}

function locked() {
  return new AppError('login_locked', `Too many attempts. Try again in ${LOGIN_LOCK_MINUTES} minutes.`, 429);
}

export async function register(
  input: { phone: string; password: string; name: string; role?: 'tenant' | 'owner' },
  now = clock.now(),
): Promise<AuthSession> {
  if (env.appMode === 'demo') throw methodDisabled('This is a demo. Use one of the demo accounts.');
  // Re-check the policy here too, so callers that bypass the route schema can't store a weak password.
  const problem = passwordProblem(input.password, input.phone);
  if (problem) throw new AppError('validation', problem, 400, [{ path: 'password', message: problem }]);
  const passwordHash = await Bun.password.hash(input.password);
  const u = schema.users;
  // Phone ownership is not proven, so never admin and never verified (resolveRole with phoneVerified=false).
  const inserted = await getDb()
    .insert(u)
    .values({ id: newId('usr'), phone: input.phone, name: input.name, role: resolveRole(input.phone, null, false, input.role), passwordHash, createdAt: now })
    .onConflictDoNothing({ target: u.phone })
    .returning({ id: u.id });
  if (inserted.length === 0) {
    // Never attach a password to an existing (maybe OTP-only) account: that would be a takeover.
    throw new AppError('signup_failed', 'We couldn’t create an account with these details. If you already have one, log in instead.', 409);
  }
  return createSession(inserted[0]!.id, now);
}

export async function loginWithPassword(input: { phone: string; password: string }, now = clock.now()): Promise<AuthSession> {
  if (env.appMode === 'demo') throw methodDisabled('This is a demo. Use one of the demo accounts.');
  if (!(await takeLoginAttempt(input.phone, now))) throw locked();
  const [user] = await getDb().select().from(schema.users).where(eq(schema.users.phone, input.phone)).limit(1);
  const ok = await Bun.password.verify(input.password, user?.passwordHash ?? (await dummyPasswordHash()));
  if (!user?.passwordHash || !ok || !loginAllowed(user)) throw badCredentials();
  await clearLoginAttempts(input.phone);
  return createSession(user.id, now);
}

/** One-tap sign-in for seeded demo accounts, on dev and demo instances only. */
export async function demoLogin(phone: string, now = clock.now()): Promise<AuthSession> {
  if (!env.demoLoginEnabled) throw methodDisabled('Demo accounts aren’t available here.');
  const [user] = await getDb().select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  if (!user?.isDemo) throw badCredentials();
  return createSession(user.id, now);
}

/** Set a first password, or change it (needs the current one). Signs out every other session. */
export async function changePassword(
  user: User,
  currentToken: string,
  input: { currentPassword?: string; newPassword: string },
  now = clock.now(),
) {
  if (user.isDemo) throw methodDisabled('Demo accounts can’t set a password.');
  const problem = passwordProblem(input.newPassword, user.phone);
  if (problem) throw new AppError('validation', problem, 400, [{ path: 'newPassword', message: problem }]);
  const db = getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (row?.passwordHash) {
    // A stolen session must not be enough to brute-force the current password.
    if (!(await takeLoginAttempt(user.phone, now))) throw locked();
    if (!input.currentPassword || !(await Bun.password.verify(input.currentPassword, row.passwordHash))) {
      throw new AppError('invalid_credentials', 'Your current password is wrong.', 401, [{ path: 'currentPassword', message: 'Wrong password' }]);
    }
    await clearLoginAttempts(user.phone);
  }
  const passwordHash = await Bun.password.hash(input.newPassword);
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, user.id));
    await tx
      .delete(schema.sessions)
      .where(and(eq(schema.sessions.userId, user.id), ne(schema.sessions.tokenHash, sha256Hex(currentToken))));
  });
  return { ok: true as const };
}

export async function authMethods(): Promise<AuthMethods> {
  const otp = otpMode();
  const demoEnabled = env.demoLoginEnabled;
  const accounts: AuthMethods['demo']['accounts'] = [];
  if (demoEnabled) {
    const rows = await getDb()
      .select({ phone: schema.users.phone, name: schema.users.name, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.isDemo, true))
      .orderBy(asc(schema.users.phone));
    // One account per role keeps the picker short: admin, owner, tenant.
    for (const role of ['admin', 'owner', 'tenant'] as const) {
      const first = rows.find((r) => r.role === role);
      if (first) accounts.push(first);
    }
  }
  const standard = env.appMode === 'standard';
  return { mode: env.appMode, otp, password: standard, signup: standard, demo: { enabled: demoEnabled, accounts } };
}

/** Server-side admin bootstrap (no HTTP route): works without SMS, for an account that already exists. */
export async function grantAdmin(phone: string) {
  const [row] = await getDb().update(schema.users).set({ role: 'admin' }).where(eq(schema.users.phone, phone)).returning();
  if (!row) throw new AppError('not_found', `No account with phone ${phone}. Ask them to sign up first.`, 404);
  return toUser(row);
}
