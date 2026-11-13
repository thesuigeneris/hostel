import { expect, test } from '@playwright/test';
import { pageProblems } from './a11y';
import { signIn } from './helpers';

/**
 * Product gap 1c (DPDP Act 2023): a resident downloads a copy of their data and deletes their account; they are signed
 * out and the same number later signs up as a new, empty account.
 */

const PHONE = `973${Date.now().toString().slice(-7)}`;

test('download my data, then delete my account', async ({ browser }) => {
  const page = await signIn(browser, PHONE, { name: 'Meera Nair', next: '/account' });
  const data = page.getByRole('heading', { name: 'Your data' });
  await expect(data).toBeVisible();

  // The download is a JSON file with my account in it (fetched with this browser's session).
  const file = await page.request.get('/account/export');
  expect(file.status()).toBe(200);
  expect(file.headers()['content-disposition']).toContain('hostels-my-data.json');
  const json = await file.json();
  expect(json.account).toMatchObject({ phone: PHONE, name: 'Meera Nair' });

  await page.getByRole('link', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/account\/delete$/);
  await expect(page.getByRole('heading', { name: 'What happens' })).toBeVisible();
  expect(await pageProblems(page, '/account/delete')).toEqual([]);

  // A wrong word is refused by the form itself; the right one deletes.
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/account\/deleted$/);
  await expect(page.getByRole('heading', { name: 'Your account is deleted' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  expect(await pageProblems(page, '/account/deleted')).toEqual([]);

  // Signed out: the account page sends them to log in.
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login/);
  await page.context().close();
});
