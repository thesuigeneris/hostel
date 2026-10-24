import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
export const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
export const OTP = '123456';
export const ADMIN = '9000000001';
export const DEMO_OWNER = '9000000002';
export const DEMO_TENANT = '9000000003';
const SESSION_COOKIE = 'hostels_session';

// The API allows 5 OTP sends per phone per hour, so each phone signs in through the form once per run
// and later sign-ins reuse that session.
const sessions = new Map<string, string>();

/** Opens a new browser context signed in as `phone`, landing on `next` (default: the role's home). */
export async function signIn(browser: Browser, phone: string, opts: { owner?: boolean; name?: string; next?: string } = {}): Promise<Page> {
  const context = await browser.newContext();
  const saved = sessions.get(phone);
  if (saved) {
    await context.addCookies([{ name: SESSION_COOKIE, value: saved, url: WEB }]);
    const page = await context.newPage();
    await page.goto(opts.next ?? '/');
    return page;
  }
  const page = await context.newPage();
  await page.goto(`/login${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ''}`);
  await page.locator('input[name=phone]').fill(phone);
  if (opts.owner) await page.getByLabel('I own or run a hostel').check();
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText(`We sent a 6-digit code to +91 ${phone}.`)).toBeVisible();
  await page.locator('input[name=otp]').fill(OTP);
  if (opts.name) await page.locator('input[name=name]').fill(opts.name);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await remember(context, phone);
  return page;
}

async function remember(context: BrowserContext, phone: string) {
  const cookie = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);
  if (cookie) sessions.set(phone, cookie.value);
}

/** API token for `phone`, reusing a browser session when there is one. */
export async function apiToken(phone: string): Promise<string> {
  const saved = sessions.get(phone);
  if (saved) return saved;
  const post = (path: string, body: unknown) =>
    fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await post('/auth/otp', { phone });
  const res = await post('/auth/verify', { phone, otp: OTP });
  const { token } = (await res.json()) as { token: string };
  sessions.set(phone, token);
  return token;
}

export async function apiGet<T = unknown>(phone: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${await apiToken(phone)}` } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function publicGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
