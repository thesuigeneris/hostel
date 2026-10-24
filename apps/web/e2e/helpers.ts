import { expect, type Page } from '@playwright/test';

export const DEMO = { admin: '9000000001', owner: '9000000002', tenant: '9000000003' } as const;
export const API = 'http://localhost:4200';

/** Sign in through the real login page (dev OTP is 123456). */
export async function signIn(page: Page, phone: string, opts: { owner?: boolean; name?: string; next?: string } = {}) {
  const qs = new URLSearchParams();
  if (opts.next) qs.set('next', opts.next);
  if (opts.owner) qs.set('role', 'owner');
  await page.goto(`/login${qs.size ? `?${qs}` : ''}`);
  await page.getByLabel(/phone/i).fill(phone);
  await page.getByRole('button', { name: /send|get otp|continue/i }).click();
  await page.getByLabel(/otp|code/i).fill('123456');
  const name = page.getByLabel(/your name|^name/i);
  if (opts.name && (await name.isVisible().catch(() => false))) await name.fill(opts.name);
  await page.getByRole('button', { name: /verify|sign in|log in|continue/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

/** Get an API token directly (for setup steps that are not under test). */
export async function apiToken(phone: string): Promise<string> {
  await fetch(`${API}/auth/otp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
  const r = await fetch(`${API}/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, otp: '123456' }) });
  return ((await r.json()) as { token: string }).token;
}

export async function apiCall<T = any>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}
