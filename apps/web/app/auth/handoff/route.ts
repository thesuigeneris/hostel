import { createApiClient } from '@hostels/shared';
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { safePath } from '@/lib/actions';
import { API_URL, SESSION_COOKIE, SITE_URL } from '@/lib/api';

/** The app opens `/auth/handoff?code=…&next=/pay/…` so the person lands on the website signed in. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') ?? '';
  const next = safePath(req.nextUrl.searchParams.get('next'), '/account');
  try {
    const session = await createApiClient(API_URL).auth.redeemHandoff(code);
    (await cookies()).set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(session.expiresAt),
    });
    return NextResponse.redirect(new URL(next, SITE_URL));
  } catch {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, SITE_URL));
  }
}
