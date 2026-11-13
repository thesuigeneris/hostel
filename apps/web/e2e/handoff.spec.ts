import { expect, test } from '@playwright/test';
import { API, OTP } from './helpers';

/** Return paths must never send someone off-site, whatever `next` says. */

const json = { 'content-type': 'application/json' };
const stamp = Date.now().toString().slice(-7);

async function handoffCode(phone: string) {
  await fetch(`${API}/auth/otp`, { method: 'POST', headers: json, body: JSON.stringify({ phone }) });
  const verify = await fetch(`${API}/auth/verify`, { method: 'POST', headers: json, body: JSON.stringify({ phone, otp: OTP }) });
  const { token } = (await verify.json()) as { token: string };
  const res = await fetch(`${API}/auth/handoff`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return ((await res.json()) as { code: string }).code;
}

test('app hand-off: a backslash in next falls back to the account page', async ({ request }) => {
  const code = await handoffCode(`963${stamp}`);
  const res = await request.get(`/auth/handoff?code=${code}&next=/%5Cevil.example/phish`, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers().location!).pathname).toBe('/account');
  expect(res.headers().location).not.toContain('evil.example');
});

test('login form: a backslash in next stays on the site', async ({ page, baseURL }) => {
  await page.goto(`/login?next=${encodeURIComponent('/\\evil.example/phish')}`);
  await page.locator('input[name=phone]').fill(`964${stamp}`);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.locator('input[name=otp]').fill(OTP);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  expect(new URL(page.url()).pathname).toBe('/account');
});
