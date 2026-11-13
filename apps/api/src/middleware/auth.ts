import type { Role, User } from '@hostels/shared';
import { createMiddleware } from 'hono/factory';
import { AppError } from '../lib/errors';
import { getSessionUser } from '../services/auth';

export type AppEnv = { Variables: { user: User; token: string } };

export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match ? match[1]! : null;
}

/** Requires a valid session. With roles, the user must hold one of them; admins pass every role guard. */
export const requireAuth = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = bearerToken(c.req.header('Authorization'));
    const user = token ? await getSessionUser(token) : null;
    if (!token || !user) throw new AppError('unauthorized', 'Sign in to continue');
    if (roles.length > 0 && user.role !== 'admin' && !roles.includes(user.role)) {
      throw new AppError('forbidden', 'Your account cannot do this');
    }
    c.set('user', user);
    c.set('token', token);
    await next();
  });
