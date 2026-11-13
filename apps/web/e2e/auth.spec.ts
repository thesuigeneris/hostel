import { expect, test } from '@playwright/test';
import { DEMO_TENANT } from './helpers';

// PRP-01: sign-in without SMS, and demo accounts. Runs against the dev-mode API (OTP stub on, demo login on).
const stamp = Date.now().toString().slice(-7);
const PHONE = `97${stamp.padStart(8, '1')}`;
const FIRST = 'a quiet room near the lake';
const SECOND = 'sunlight on the old stairs';

test('password sign-up, log out, log in again, change password', async ({ page }) => {
  await page.goto('/login?view=signup');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Your name').fill('Kiran Test');
  await page.locator('input[name=phone]').fill(PHONE);
  await page.getByLabel('Password').fill('too short');
  // The browser enforces the minimum length before the server is even asked.
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/view=signup/);
  await page.getByLabel('Password').fill(FIRST);
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.waitForURL('**/account');
  await expect(page.getByText('not verified yet', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto('/login?view=password');
  await page.locator('input[name=phone]').fill(PHONE);
  await page.getByLabel('Password').fill('this is the wrong one');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Phone number or password is wrong.')).toBeVisible();
  // The phone stays filled after a failed attempt.
  await expect(page.locator('input[name=phone]')).toHaveValue(PHONE);

  await page.getByLabel('Password').fill(FIRST);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/account');

  await page.getByLabel('Current password').fill(FIRST);
  await page.getByLabel('New password').fill(SECOND);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password saved. Other devices were signed out.')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto('/login?view=password');
  await page.locator('input[name=phone]').fill(PHONE);
  await page.getByLabel('Password').fill(SECOND);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/account');
});

test('demo accounts sign in with one tap in development', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Try a demo account' })).toBeVisible();
  await page.getByRole('button', { name: 'Demo tenant' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/account');
  await expect(page.getByText(`+91 ${DEMO_TENANT}`, { exact: false })).toBeVisible();
  // Demo accounts can't set a password.
  await expect(page.getByRole('heading', { name: 'Password' })).toHaveCount(0);
});
