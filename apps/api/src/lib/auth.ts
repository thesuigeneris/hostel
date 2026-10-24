import type { Context, MiddlewareHandler } from 'hono';
import type { Role } from '@hostels/shared';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '../db';
import { err } from './http';
import type { AppEnv, UserRow } from './types';

export async function userForToken(token: string): Promise<UserRow | null> {
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.token, token), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

function bearer(c: Context): string | null {
  const m = (c.req.header('Authorization') ?? '').match(/^Bearer (\S+)$/);
  return m?.[1] ?? null;
}

/** Sets `c.get('user')` when a valid token is present; never rejects. Mounted globally. */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c);
  c.set('user', token ? await userForToken(token) : null);
  await next();
};

/** Rejects unless signed in. Any role. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) throw err.unauthorized();
  await next();
};

/** Rejects unless the user has one of `roles`. Admin always passes. */
export const requireRole =
  (...roles: Role[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const u = c.get('user');
    if (!u) throw err.unauthorized();
    if (u.role !== 'admin' && !roles.includes(u.role)) throw err.forbidden();
    await next();
  };

/** The signed-in user. Only call behind requireAuth/requireRole. */
export function currentUser(c: Context<AppEnv>): UserRow {
  const u = c.get('user');
  if (!u) throw err.unauthorized();
  return u;
}
