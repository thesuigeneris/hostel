import { type NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy, newNonce } from './lib/csp';

/**
 * A fresh script nonce for every page (M14). The policy goes on the request too: that is where Next.js reads the nonce
 * it puts on its own scripts. Every page is already rendered per request (the layout reads the session cookie), so
 * this costs no static caching.
 */
export function middleware(req: NextRequest) {
  const nonce = newNonce();
  const policy = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV !== 'production',
    apiOrigin: process.env.CSP_API_ORIGIN ?? 'http://localhost:4000',
  });
  const headers = new Headers(req.headers);
  headers.set('content-security-policy', policy);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', policy);
  return res;
}

export const config = {
  // Not for files that are never HTML (built assets, images); everything else, prefetches included, gets a policy.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
