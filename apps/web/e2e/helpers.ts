import { expect, type Page } from '@playwright/test';

export const DEMO = { admin: '9000000001', owner: '9000000002', tenant: '9000000003' } as const;
export const API = process.env.E2E_API_URL ?? 'http://localhost:4200';
export const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3200';

const sessions = new Map<string, string>();
const tokens = new Map<string, string>();

/**
 * Sign in through the real login page (dev OTP is 123456). The first sign-in per phone uses the
 * form; later ones reuse that session, because the API allows only 5 OTP sends per phone per hour.
 */
export async function signIn(page: Page, phone: string, opts: { owner?: boolean; name?: string; next?: string } = {}) {
  await page.context().clearCookies();
  const saved = sessions.get(phone);
  if (saved) {
    await page.context().addCookies([{ name: 'hostels_session', value: saved, url: WEB }]);
    await page.goto(opts.next ?? '/');
    return;
  }
  await page.goto(`/login${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ''}`);
  await page.waitForLoadState('networkidle'); // hydrated, so typing reaches React state
  await page.getByLabel('Mobile number').fill(phone);
  if (opts.owner) await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText(`Enter the code sent to +91 ${phone}`)).toBeVisible();
  await page.getByLabel('6-digit code').fill('123456');
  if (opts.name) await page.getByLabel('Your name').fill(opts.name);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  const cookie = (await page.context().cookies()).find((c) => c.name === 'hostels_session');
  if (cookie) {
    sessions.set(phone, cookie.value);
    tokens.set(phone, cookie.value);
  }
}

/** Get an API token directly, for assertions that are not part of the UI under test. */
export async function apiToken(phone: string): Promise<string> {
  const cached = tokens.get(phone);
  if (cached) return cached;
  const post = (path: string, body: unknown) => fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await post('/auth/otp', { phone });
  const r = await post('/auth/verify', { phone, otp: '123456' });
  const token = ((await r.json()) as { token: string }).token;
  tokens.set(phone, token);
  return token;
}

export async function apiGet<T = any>(token: string, path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}
