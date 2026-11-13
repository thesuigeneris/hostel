import { createHmac, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { clock } from './clock';
import { env } from './env';
import { AppError } from './errors';

/**
 * Request limits, in one place. Each rule allows `limit` requests per `windowSeconds`, per signed-in person or, for
 * someone signed out, per network address (see `clientIp`). They stop scripts, not people: a person who hits one is
 * told in plain words when to try again. The per-phone OTP and password throttles in `services/auth.ts` still apply
 * on top of these.
 *
 * Overrides: `RATE_LIMITS="login=30/600,search=120/60"` (requests/seconds per rule) and `RATE_LIMIT_FACTOR` (multiplies
 * every limit; the browser and API tests raise it, since all their traffic comes from one machine).
 */
export const RATE_LIMIT_RULES = {
  /** Phone + password sign-up. */
  signup: { limit: 10, windowSeconds: 3600, message: 'Too many sign-ups from this network' },
  /** Password login, OTP check, demo login, app hand-off. */
  login: { limit: 20, windowSeconds: 600, message: 'Too many login attempts from this network' },
  /** Sending an OTP text (each one costs money). */
  otp: { limit: 10, windowSeconds: 3600, message: 'Too many code requests from this network' },
  /** Issues, issue updates, posts, comments, reviews, flags, reports, visit requests. */
  write: { limit: 60, windowSeconds: 600, message: 'You are sending a lot in a short time' },
  /** Photo uploads. */
  upload: { limit: 30, windowSeconds: 600, message: 'Too many photos in a short time' },
  /** Search results. */
  search: { limit: 120, windowSeconds: 60, message: 'Too many searches in a short time' },
  /** Suggestions while typing. */
  suggest: { limit: 180, windowSeconds: 60, message: 'Too many searches in a short time' },
  /** Hostel page views (counted once per visitor per 30 minutes anyway). */
  view: { limit: 120, windowSeconds: 60, message: 'Too many page views in a short time' },
} as const satisfies Record<string, { limit: number; windowSeconds: number; message: string }>;
export type RateLimitRule = keyof typeof RATE_LIMIT_RULES;

/** The rules in force: defaults, then `RATE_LIMITS` overrides, times `RATE_LIMIT_FACTOR`. */
export function effectiveRule(rule: RateLimitRule): { limit: number; windowSeconds: number } {
  const base = RATE_LIMIT_RULES[rule];
  const override = parseOverrides(env.rateLimitOverrides)[rule];
  return { limit: Math.max(1, Math.round((override?.limit ?? base.limit) * env.rateLimitFactor)), windowSeconds: override?.windowSeconds ?? base.windowSeconds };
}

/** `login=30/600,search=120/60` → rule overrides; anything malformed is reported by the config check, then ignored. */
export function parseOverrides(text: string | undefined): Partial<Record<RateLimitRule, { limit: number; windowSeconds: number }>> {
  const out: Partial<Record<RateLimitRule, { limit: number; windowSeconds: number }>> = {};
  for (const part of (text ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^([a-z]+)=(\d+)\/(\d+)$/.exec(part);
    if (m && m[1]! in RATE_LIMIT_RULES && Number(m[2]) > 0 && Number(m[3]) > 0) {
      out[m[1] as RateLimitRule] = { limit: Number(m[2]), windowSeconds: Number(m[3]) };
    }
  }
  return out;
}

/** Problems with the override settings, for the production config check. */
export function rateLimitConfigProblems(e: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  for (const part of (e.RATE_LIMITS ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^([a-z]+)=(\d+)\/(\d+)$/.exec(part);
    if (!m || !(m[1]! in RATE_LIMIT_RULES) || Number(m[2]) < 1 || Number(m[3]) < 1) {
      problems.push(`RATE_LIMITS entry "${part}" is not valid. Use rule=requests/seconds with a rule from: ${Object.keys(RATE_LIMIT_RULES).join(', ')}.`);
    }
  }
  if (e.RATE_LIMIT_FACTOR !== undefined && e.RATE_LIMIT_FACTOR !== '') {
    const f = Number(e.RATE_LIMIT_FACTOR);
    if (!Number.isFinite(f) || f <= 0) problems.push(`RATE_LIMIT_FACTOR must be a positive number (got "${e.RATE_LIMIT_FACTOR}").`);
    else if (f > 1) problems.push(`RATE_LIMIT_FACTOR is ${f}: production limits are raised ${f} times. Leave it unset (1) for real users.`);
  }
  return problems;
}

// --- the store -------------------------------------------------------------------

/**
 * Fixed windows in this process's memory. One API instance runs (docs/DEPLOY.md), so this is the whole picture; a
 * restart forgets the counts, which only ever lets someone through sooner. Keys are HMACs under a key made at start-up
 * and never written anywhere, so no address is kept as such, not even in memory.
 */
const KEY = randomBytes(32);
const windows = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 100_000;

function hashed(rule: string, subject: string) {
  return createHmac('sha256', KEY).update(`${rule}|${subject}`).digest('base64url').slice(0, 27);
}

/**
 * Remembers `subject` for `seconds` under a hashed key and says whether it was already remembered. For "count once
 * per visitor per half hour": the visitor's address never sits in memory as such.
 */
const seen = new Map<string, number>();
export function seenWithin(scope: string, subject: string, seconds: number): boolean {
  const now = clock.now().getTime();
  if (seen.size > MAX_KEYS) {
    for (const [k, until] of seen) if (until <= now) seen.delete(k);
    if (seen.size > MAX_KEYS) seen.clear();
  }
  const key = hashed(scope, subject);
  const until = seen.get(key);
  if (until !== undefined && until > now) return true;
  seen.set(key, now + seconds * 1000);
  return false;
}

function sweep(now: number) {
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  // Still full (a flood of fresh addresses): drop the oldest half rather than grow without bound.
  if (windows.size > MAX_KEYS) {
    let drop = windows.size / 2;
    for (const k of windows.keys()) {
      if (drop-- <= 0) break;
      windows.delete(k);
    }
  }
}

/** Counts one request; returns how long to wait when over the limit, else null. */
export function take(rule: RateLimitRule, subject: string): { retryAfterSeconds: number } | null {
  const { limit, windowSeconds } = effectiveRule(rule);
  const now = clock.now().getTime();
  if (windows.size > MAX_KEYS) sweep(now);
  const key = hashed(rule, subject);
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return null;
  }
  w.count += 1;
  return w.count > limit ? { retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) } : null;
}

/** Tests start from empty windows. */
export function resetRateLimits() {
  windows.clear();
  seen.clear();
}

export function waitWords(seconds: number) {
  if (seconds < 90) return seconds <= 1 ? 'a second' : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 90 ? `${minutes} minutes` : `${Math.ceil(minutes / 60)} hours`;
}

/** The 429 a client gets: plain words saying when to try again, and `Retry-After` for programs. */
export function rateLimited(c: Context, rule: RateLimitRule, retryAfterSeconds: number): AppError {
  c.header('Retry-After', String(retryAfterSeconds));
  return new AppError('rate_limited', `${RATE_LIMIT_RULES[rule].message}. Please try again in ${waitWords(retryAfterSeconds)}.`, 429);
}
