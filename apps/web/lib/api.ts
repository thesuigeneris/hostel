import 'server-only';
import { ApiError, createApiClient, type User } from '@hostels/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

export const SESSION_COOKIE = 'hostels_session';
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** API client for server components and actions. The session token lives in an httpOnly cookie and never reaches the browser. */
export async function api() {
  const jar = await cookies();
  return createApiClient(API_URL, () => jar.get(SESSION_COOKIE)?.value, (input, init) => fetch(input, { ...init, cache: 'no-store' }));
}

/** Public data with short caching, for pages that don't depend on who is looking. */
export function publicApi(revalidate = 60) {
  return createApiClient(API_URL, () => null, (input, init) => fetch(input, { ...init, next: { revalidate } }));
}

export const currentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  if (!jar.get(SESSION_COOKIE)) return null;
  try {
    return await (await api()).me.get();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
});

/** Redirects to login unless signed in with one of the roles (admins pass every check). */
export async function requireUser(path: string, ...roles: User['role'][]): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (roles.length && user.role !== 'admin' && !roles.includes(user.role)) redirect(`/login?next=${encodeURIComponent(path)}&role=${roles[0]}`);
  return user;
}

export async function health() {
  try {
    return await publicApi(30).health();
  } catch {
    return null;
  }
}
