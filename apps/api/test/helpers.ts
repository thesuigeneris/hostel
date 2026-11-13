import { getDb } from '../src/db';
import { truncateAll } from '../src/db/seed';
import { createApp } from '../src/app';

export const app = createApp({ log: false });

export async function resetDb() {
  await truncateAll(getDb());
}

type Opts = { token?: string; body?: unknown; method?: string; headers?: Record<string, string> };

export async function call(path: string, opts: Opts = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await app.request(path, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Full OTP login in stub mode; returns the session token. */
export async function login(phone: string, role?: 'tenant' | 'owner') {
  const sent = await call('/auth/otp', { body: { phone } });
  if (sent.status !== 200) throw new Error(`otp failed: ${JSON.stringify(sent.body)}`);
  const res = await call('/auth/verify', { body: { phone, otp: '123456', role } });
  if (res.status !== 200) throw new Error(`verify failed: ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}
