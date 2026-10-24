import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ApiRequestError, createApiClient } from '@hostels/shared';
import { API_URL, SESSION_COOKIE } from '@/lib/config';

/** POST { phone, otp, role?, name? } → verifies the OTP and sets the session cookie. Returns { user }. */
export async function POST(req: NextRequest) {
  const input = await req.json();
  try {
    const session = await createApiClient(API_URL).auth.verify(input);
    (await cookies()).set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(session.expiresAt),
    });
    return NextResponse.json({ user: session.user });
  } catch (e) {
    if (e instanceof ApiRequestError) return NextResponse.json({ error: e.code, message: e.message, issues: e.issues }, { status: e.status });
    throw e;
  }
}

/** DELETE → ends the session and clears the cookie. */
export async function DELETE() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await createApiClient(API_URL, { getToken: () => token }).auth.logout().catch(() => {});
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
