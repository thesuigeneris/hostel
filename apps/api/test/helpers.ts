import { getDb } from '../src/db';
import { truncateAll } from '../src/db/seed';
import { createApp } from '../src/app';

export const app = createApp({ log: false });

export async function resetDb() {
  await truncateAll(getDb());
}

/** `ip` is the address the request arrives from, as Bun's server reports it (otherwise none, read as "unknown"). */
type Opts = { token?: string; body?: unknown; method?: string; headers?: Record<string, string>; ip?: string };

export async function call(path: string, opts: Opts = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await app.request(
    path,
    {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers,
      body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
    },
    opts.ip ? { requestIP: () => ({ address: opts.ip!, family: opts.ip!.includes(':') ? 'IPv6' : 'IPv4', port: 50000 }) } : undefined,
  );
  const text = await res.text();
  // Headers ride along without being part of `toEqual` comparisons of { status, body }.
  return Object.defineProperty({ status: res.status, body: text ? JSON.parse(text) : null }, 'headers', { value: res.headers, enumerable: false }) as {
    status: number;
    // biome-ignore lint/suspicious/noExplicitAny: response bodies are untyped JSON, read as each test needs (as before)
    body: any;
    headers: Headers;
  };
}

/** Full OTP login in stub mode; returns the session token. */
export async function login(phone: string, role?: 'tenant' | 'owner') {
  const sent = await call('/auth/otp', { body: { phone } });
  if (sent.status !== 200) throw new Error(`otp failed: ${JSON.stringify(sent.body)}`);
  const res = await call('/auth/verify', { body: { phone, otp: '123456', role } });
  if (res.status !== 200) throw new Error(`verify failed: ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}
