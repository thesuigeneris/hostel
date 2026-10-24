// Smoke test of the mobile login screen, run in Chromium against the Expo web build.
// 1. Export the app pointed at a dev API (OTP stub and demo login on):
//    EXPO_PUBLIC_API_URL=http://localhost:4000 bunx expo export --platform web --output-dir dist
// 2. Serve `dist` on :8081 with a single-page fallback (the API allows that origin by default).
// 3. node apps/mobile/scripts/web-login-smoke.mjs [screenshot dir]
// This checks the screen logic and API calls the phone app shares with the web build. It does not check
// native behaviour (secure storage, keyboards, deep links); that needs a device.
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const APP = process.env.MOBILE_WEB_URL ?? 'http://localhost:8081';
const shots = process.argv[2] ?? '.';
const browser = await chromium.launch();
const results = [];
const phoneNo = () => `96${Date.now().toString().slice(-8)}`;

async function signedInAs(page, phone) {
  await page.goto(`${APP}/profile`);
  await page.getByText(phone, { exact: false }).first().waitFor({ timeout: 15000 });
}

async function step(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await fn(page);
    results.push(`PASS ${name}${errors.length ? ` (page errors: ${errors.join(' | ')})` : ''}`);
  } catch (e) {
    await page.screenshot({ path: `${shots}/mobile-fail-${name.replace(/\W+/g, '-')}.png` });
    results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`);
  }
  await ctx.close();
}

await step('otp login (stub code)', async (page) => {
  const phone = phoneNo();
  await page.goto(`${APP}/login`);
  await page.getByPlaceholder('98765 43210').fill(phone);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.getByText('Use a different number').waitFor();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForTimeout(1000);
  await signedInAs(page, phone);
});

await step('password sign-up, then password login', async (page) => {
  const phone = phoneNo();
  const password = 'a quiet room near the lake';
  await page.goto(`${APP}/login`);
  await page.getByText('Log in with a password').click();
  await page.getByText('Create an account').click();
  await page.locator('input').nth(0).fill('Mobile Tester');
  await page.getByPlaceholder('98765 43210').fill(phone);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForTimeout(1000);
  await signedInAs(page, phone);
  // Sign out by clearing storage, then log back in with the password.
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP}/login`);
  await page.getByText('Log in with a password').click();
  await page.getByPlaceholder('98765 43210').fill(phone);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForTimeout(1000);
  await signedInAs(page, phone);
});

await step('demo account button', async (page) => {
  await page.goto(`${APP}/login`);
  await page.getByText('Demo tenant', { exact: true }).click();
  await page.waitForTimeout(1000);
  await signedInAs(page, '9000000003');
});

await step('wrong password is refused with a generic message', async (page) => {
  await page.goto(`${APP}/login`);
  await page.getByText('Log in with a password').click();
  await page.getByPlaceholder('98765 43210').fill('9000000003');
  await page.locator('input[type=password]').fill('definitely not the password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByText(/incorrect|didn.t match|wrong/i).first().waitFor({ timeout: 10000 });
});

console.log(results.join('\n'));
await browser.close();
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
