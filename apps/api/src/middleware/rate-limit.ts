import type { Context, Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { clientIp } from '../lib/client-ip';
import { type RateLimitRule, rateLimited, take } from '../lib/rate-limit';
import { getSessionUser } from '../services/auth';
import { type AppEnv, bearerToken } from './auth';

type By = 'ip' | 'person';

/**
 * Who a request counts against: the signed-in person (`person` rules, when the request carries a live session), else
 * the client's network address. Sign-up and login are always per address: there is no person yet.
 */
async function subject(c: Context<AppEnv>, by: By) {
  if (by === 'person') {
    const known = c.get('user');
    if (known) return `user:${known.id}`;
    const token = bearerToken(c.req.header('Authorization'));
    const user = token ? await getSessionUser(token) : null;
    if (user) return `user:${user.id}`;
  }
  return `ip:${clientIp(c)}`;
}

export const rateLimit = (rule: RateLimitRule, by: By) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const over = take(rule, await subject(c, by));
    if (over) throw rateLimited(c, rule, over.retryAfterSeconds);
    await next();
  });

/**
 * Every limited endpoint, in one table (M4): sign-up, login and OTP per address; writes, uploads, search and
 * suggestions per person (or address when signed out); page views per address. Applied in `createApp`, so the
 * production server, the browser-test server and the API tests all run behind the same limits.
 */
export const LIMITED: [method: 'GET' | 'POST' | 'PUT', path: string, rule: RateLimitRule, by: By][] = [
  ['POST', '/auth/register', 'signup', 'ip'],
  ['POST', '/auth/login', 'login', 'ip'],
  ['POST', '/auth/verify', 'login', 'ip'],
  ['POST', '/auth/demo', 'login', 'ip'],
  ['POST', '/auth/handoff/redeem', 'login', 'ip'],
  ['POST', '/me/password', 'login', 'person'],
  ['POST', '/auth/otp', 'otp', 'ip'],
  ['GET', '/hostels', 'search', 'person'],
  ['GET', '/suggest', 'suggest', 'person'],
  ['POST', '/hostels/:slug/view', 'view', 'ip'],
  ['POST', '/hostels/:id/visits', 'write', 'person'],
  ['POST', '/hostels/:id/issues', 'write', 'person'],
  ['POST', '/issues/:id/updates', 'write', 'person'],
  ['POST', '/hostels/:id/community', 'write', 'person'],
  ['POST', '/posts/:id/comments', 'write', 'person'],
  ['PUT', '/hostels/:id/review', 'write', 'person'],
  ['POST', '/reviews/:id/flag', 'write', 'person'],
  ['POST', '/posts/:id/report', 'write', 'person'],
  ['POST', '/comments/:id/report', 'write', 'person'],
  ['POST', '/uploads', 'upload', 'person'],
];

export function applyRateLimits(app: Hono<AppEnv>) {
  for (const [method, path, rule, by] of LIMITED) app.on(method, path, rateLimit(rule, by));
}
