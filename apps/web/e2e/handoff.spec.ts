import { expect, test } from '@playwright/test';

/** The app-to-website sign-in must never send someone off-site, whatever `next` says. */

const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const json = { 'content-type': 'application/json' };

async function handoffCode() {
  const phone = `963${Date.now().toString().slice(-7)}`;
  await fetch(`${API}/auth/otp`, { method: 'POST', headers: json, body: JSON.stringify({ phone }) });
  const verify = await fetch(`${API}/auth/verify`, { method: 'POST', headers: json, body: JSON.stringify({ phone, otp: '123456' }) });
  const { token } = (await verify.json()) as { token: string };
  const res = await fetch(`${API}/auth/handoff`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return ((await res.json()) as { code: string }).code;
}

test('a backslash in next falls back to the account page', async ({ request }) => {
  const res = await request.get(`/auth/handoff?code=${await handoffCode()}&next=/%5Cevil.example/phish`, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers().location!).pathname).toBe('/account');
  expect(res.headers().location).not.toContain('evil.example');
});
