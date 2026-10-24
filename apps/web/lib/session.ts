import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiRequestError, createApiClient, type Role, type User } from '@hostels/shared';
import { API_URL, SESSION_COOKIE } from './config';

export async function getToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** API client for Server Components / route handlers, authenticated as the visitor. */
export async function serverApi() {
  const token = await getToken();
  return createApiClient(API_URL, { getToken: () => token });
}

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = await getToken();
  if (!token) return null;
  try {
    return await createApiClient(API_URL, { getToken: () => token }).me.get();
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401) return null;
    throw e;
  }
});

/**
 * Use at the top of a protected page. Redirects to /login (returning here afterwards)
 * when signed out, and to / when the role does not match. Admin passes every role check.
 */
export async function requireUser(nextPath: string, roles?: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (roles && user.role !== 'admin' && !roles.includes(user.role)) redirect('/');
  return user;
}
