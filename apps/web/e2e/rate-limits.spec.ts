import { expect, test } from '@playwright/test';
import { API } from './helpers';

/**
 * Rate limits reach people in words (M4). The browser-test API runs as production does, believing the website's
 * X-Forwarded-For (TRUST_PROXY=1), with every limit raised 50 times because the whole suite runs from one machine.
 * This test plays one visitor on their own network address, so it never uses up the limits other tests share.
 */
const ADDRESS = '203.0.113.77';

test('a network that used up its sign-up limit is told so in plain words, and others can still sign up', async ({ browser }) => {
  // A script signing up from that address, straight at the API: each attempt is counted, valid or not.
  const attempt = () =>
    fetch(`${API}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ADDRESS }, body: '{}' });
  let limited = false;
  for (let round = 0; round < 15 && !limited; round++) {
    const statuses = (await Promise.all(Array.from({ length: 50 }, attempt))).map((r) => r.status);
    limited = statuses.includes(429);
  }
  expect(limited).toBe(true);

  // The same visitor on the website: Caddy would set this header; the website passes it on to the API.
  const blocked = await (await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': ADDRESS } })).newPage();
  await blocked.goto('/login?view=signup');
  await blocked.getByLabel('Your name').fill('Script Kiddie');
  await blocked.getByLabel('Mobile number').fill(`96${String(Date.now()).slice(-8)}`);
  await blocked.getByLabel('Password').fill('mango tree by the old gate');
  await blocked.getByRole('button', { name: 'Create account' }).click();
  await expect(blocked.getByRole('alert')).toContainText(/Too many sign-ups from this network\. Please try again in \d+ minutes\./);
  await expect(blocked).toHaveURL(/\/login/);
  await blocked.context().close();

  // Someone on another network is not affected.
  const other = await (await browser.newContext()).newPage();
  await other.goto('/login?view=signup');
  await other.getByLabel('Your name').fill('Real Person');
  await other.getByLabel('Mobile number').fill(`95${String(Date.now()).slice(-8)}`);
  await other.getByLabel('Password').fill('mango tree by the old gate');
  await other.getByRole('button', { name: 'Create account' }).click();
  await other.waitForURL((url) => !url.pathname.startsWith('/login'));
  await other.context().close();
});
