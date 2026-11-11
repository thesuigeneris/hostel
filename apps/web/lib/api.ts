import 'server-only';
import { ApiError, createApiClient, type User } from '@hostels/shared';
import { unstable_cache } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

export const SESSION_COOKIE = 'hostels_session';
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * The visitor's network address: the last X-Forwarded-For entry, which Caddy writes in production (and Next.js fills
 * with the connection's address when nothing is in front). The API counts its limits per address for people who are
 * signed out, and believes this header only when it runs with TRUST_PROXY=1, so every call this server makes for a
 * visitor carries it; otherwise all visitors would share the limits of this one server.
 */
export async function visitorAddress(): Promise<string | null> {
  const forwarded = (await headers()).get('x-forwarded-for');
  return forwarded?.split(',').map((s) => s.trim()).filter(Boolean).pop() ?? null;
}

function withVisitor(init: RequestInit | undefined, address: string | null): HeadersInit {
  const h = new Headers(init?.headers);
  if (address) h.set('X-Forwarded-For', address);
  return h;
}

/** API client for server components and actions. The session token lives in an httpOnly cookie and never reaches the browser. */
export async function api() {
  const jar = await cookies();
  const address = await visitorAddress();
  return createApiClient(API_URL, () => jar.get(SESSION_COOKIE)?.value, (input, init) =>
    fetch(input, { ...init, headers: withVisitor(init, address), cache: 'no-store' }),
  );
}

/** For sign-up and login, before there is a session: no token, the visitor's address. */
export async function visitorOnlyApi() {
  const address = await visitorAddress();
  return createApiClient(API_URL, () => null, (input, init) => fetch(input, { ...init, headers: withVisitor(init, address), cache: 'no-store' }));
}

/** A failed answer, carried out of the cache callback so it is never cached. */
class Uncached extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfter: string | null,
  ) {
    super(`API answered ${status}`);
  }
}

/**
 * Public reads the API limits per visitor (search and suggestions): cached and shared like `publicApi`, but a cache
 * miss is fetched with the address of the visitor who caused it. A per-visitor header can't go through `fetch`'s cache
 * (it is part of the cache key, so every visitor would get their own copy), hence `unstable_cache`, keyed by URL only.
 * Errors, a 429 included, are passed through and never cached.
 */
export async function visitorApi(revalidate = 30) {
  const address = await visitorAddress();
  return createApiClient(API_URL, () => null, async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const read = unstable_cache(
      async () => {
        const res = await fetch(url, { ...init, headers: withVisitor(init, address), cache: 'no-store' });
        const body = await res.text();
        if (!res.ok) throw new Uncached(res.status, body, res.headers.get('Retry-After'));
        return body;
      },
      ['visitor-api', url],
      { revalidate, tags: [PUBLIC_DATA_TAG] },
    );
    try {
      return new Response(await read(), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      if (!(e instanceof Uncached)) throw e;
      return new Response(e.body, { status: e.status, headers: { 'Content-Type': 'application/json', ...(e.retryAfter ? { 'Retry-After': e.retryAfter } : {}) } });
    }
  });
}

/** Cache tag on every public read; `run` clears it after any change, so listings never lag an approval or edit. */
export const PUBLIC_DATA_TAG = 'public-data';

/** Public data with short caching, for pages that don't depend on who is looking. */
export function publicApi(revalidate = 60) {
  return createApiClient(API_URL, () => null, (input, init) => fetch(input, { ...init, next: { revalidate, tags: [PUBLIC_DATA_TAG] } }));
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
  if (!user) {
    // A cookie that no longer opens a session has expired (or was signed out elsewhere), so the login page says why.
    const expired = (await cookies()).has(SESSION_COOKIE);
    redirect(`/login?next=${encodeURIComponent(path)}${expired ? '&expired=1' : ''}`);
  }
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
