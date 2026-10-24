'use server';

import { ApiError, type AuthSession, createApiClient } from '@hostels/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { safePath, str } from '@/lib/actions';
import { API_URL, api, SESSION_COOKIE } from '@/lib/api';

function back(params: Record<string, string | undefined>) {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  return `/login?${q.toString()}`;
}

export async function requestOtpAction(form: FormData) {
  const phone = str(form, 'phone');
  const next = safePath(str(form, 'next'), '');
  const role = str(form, 'role') === 'owner' ? 'owner' : undefined;
  try {
    const res = await createApiClient(API_URL).auth.requestOtp({ phone });
    redirect(back({ step: 'otp', phone, next, role, dev: res.devOtp }));
  } catch (e) {
    if (e instanceof ApiError) redirect(back({ phone, next, role, error: e.issues?.[0]?.message ?? e.message }));
    throw e;
  }
}

/** Passwords are used exactly as typed: never trimmed (OWASP: no silent changes). */
function rawPassword(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
}

async function startSession(session: AuthSession, next: string): Promise<string> {
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  const home = session.user.role === 'admin' ? '/admin' : session.user.role === 'owner' ? '/owner' : '/account';
  return next || home;
}

function apiMessage(e: ApiError) {
  return e.issues?.[0]?.message ?? e.message;
}

export async function verifyOtpAction(form: FormData) {
  const phone = str(form, 'phone');
  const next = safePath(str(form, 'next'), '');
  const role = str(form, 'role') === 'owner' ? 'owner' : undefined;
  let destination = '/';
  try {
    const session = await createApiClient(API_URL).auth.verifyOtp({ phone, otp: str(form, 'otp'), role, name: str(form, 'name') || undefined });
    destination = await startSession(session, next);
  } catch (e) {
    if (e instanceof ApiError) redirect(back({ step: 'otp', phone, next, role, error: e.message }));
    throw e;
  }
  redirect(destination);
}

export async function passwordLoginAction(form: FormData) {
  const phone = str(form, 'phone');
  const next = safePath(str(form, 'next'), '');
  let destination = '/';
  try {
    const session = await createApiClient(API_URL).auth.login({ phone, password: rawPassword(form, 'password') });
    destination = await startSession(session, next);
  } catch (e) {
    if (e instanceof ApiError) redirect(back({ view: 'password', phone, next, error: apiMessage(e) }));
    throw e;
  }
  redirect(destination);
}

export async function registerAction(form: FormData) {
  const phone = str(form, 'phone');
  const name = str(form, 'name');
  const next = safePath(str(form, 'next'), '');
  const role = str(form, 'role') === 'owner' ? 'owner' : undefined;
  let destination = '/';
  try {
    const session = await createApiClient(API_URL).auth.register({ phone, name, role, password: rawPassword(form, 'password') });
    destination = await startSession(session, next);
  } catch (e) {
    if (e instanceof ApiError) redirect(back({ view: 'signup', phone, name, next, role, error: apiMessage(e) }));
    throw e;
  }
  redirect(destination);
}

export async function demoLoginAction(form: FormData) {
  const next = safePath(str(form, 'next'), '');
  let destination = '/';
  try {
    const session = await createApiClient(API_URL).auth.demo(str(form, 'demoPhone'));
    destination = await startSession(session, next);
  } catch (e) {
    if (e instanceof ApiError) redirect(back({ next, error: apiMessage(e) }));
    throw e;
  }
  redirect(destination);
}

export async function logoutAction() {
  const jar = await cookies();
  if (jar.get(SESSION_COOKIE)) {
    await (await api()).auth.logout().catch(() => undefined);
    jar.delete(SESSION_COOKIE);
  }
  redirect('/');
}
