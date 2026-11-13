import { expect, test } from '@playwright/test';
import { pageProblems } from './a11y';
import { API, OTP, apiGet, publicGet, signIn } from './helpers';

/**
 * Daily life for a subscriber, R5 in docs/product/acceptance.md: skip and undo a meal before its cut-off (shown in
 * IST), schedule a move and cancel it, cancel the plan (later skips say they earn no credit), see the paid bill with no
 * second way to pay it (S8), and get sent to log in and back when the session ends mid-flow (S7).
 */

test.describe.configure({ mode: 'serial' });

const run = Date.now().toString().slice(-7);
const SUBSCRIBER = `975${run}`;
type Card = { slug: string; name: string; isVerified: boolean; foodAvailable: boolean; bedsAvailable: number };
type Bill = { id: string; status: string; periodStart: string };

let destination: Card;

test('1. subscribe, then skip and undo a meal before its cut-off', async ({ browser }) => {
  const partners = (await publicGet<{ items: Card[] }>('/hostels?verified=true&limit=50')).items.filter((h) => h.foodAvailable && h.bedsAvailable > 1);
  const [home, next] = partners;
  destination = next!;
  const page = await signIn(browser, SUBSCRIBER, { name: 'Arun Das', next: `/subscribe/${home!.slug}` });
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/\/pay\/inv_/);
  await page.getByRole('button', { name: /simulated/ }).click();
  await expect(page.getByText('Payment received. Thank you!')).toBeVisible();

  await page.goto('/account');
  const meals = page.getByRole('region', { name: 'Meals' });
  await expect(meals).toBeVisible();
  // Every changeable meal says until when, in IST.
  await expect(meals.getByText(/until \d{1,2}:\d{2} (am|pm) IST/).first()).toBeVisible();
  const skip = meals.getByRole('button', { name: /^Skip \(save ₹\d+\): / }).first();
  const what = ((await skip.getAttribute('aria-label')) ?? '').split(': ')[1]!;
  await skip.click();
  await expect(meals.getByText(/Skipped · −₹\d+/).first()).toBeVisible();
  const undo = meals.getByRole('button', { name: `Undo skip: ${what}` });
  await expect(undo).toBeVisible();
  expect(await pageProblems(page, '/account with a skipped meal')).toEqual([]);
  await undo.click();
  await expect(meals.getByRole('button', { name: `Undo skip: ${what}` })).toHaveCount(0);
  await expect(meals.getByRole('button', { name: new RegExp(`^Skip \\(save ₹\\d+\\): ${what}$`) })).toBeVisible();
  await page.context().close();
});

test('2. schedule a move, see where to, and cancel it', async ({ browser }) => {
  const page = await signIn(browser, SUBSCRIBER, { next: '/account' });
  await page.getByRole('link', { name: 'Move hostel or room' }).click();
  await expect(page).toHaveURL(/\/account\/move/);
  await page.getByLabel('Where to').selectOption(destination.slug);
  await page.getByRole('button', { name: 'Show rooms' }).click();
  await expect(page).toHaveURL(new RegExp(`to=${destination.slug}`));
  expect(await pageProblems(page, '/account/move')).toEqual([]);
  await page.getByRole('button', { name: 'Schedule move' }).click();
  await expect(page.getByText('Move scheduled. Your bed is held and your next bill uses the new rent.')).toBeVisible();
  await expect(page.getByText(new RegExp(`Moving to ${destination.name}.* on \\d+ \\w+ \\d{4}\\.`))).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel move' }).click();
  await expect(page.getByText('Move cancelled')).toBeVisible();
  await expect(page.getByText(/Moving to/)).toHaveCount(0);
  await page.context().close();
});

test('2b. change the food plan from the next bill, see it on the account page, and keep the current plan', async ({ browser }) => {
  const page = await signIn(browser, SUBSCRIBER, { next: '/account' });
  await page.getByRole('link', { name: 'Change food plan' }).click();
  await expect(page).toHaveURL(/\/account\/food/);
  expect(await pageProblems(page, '/account/food')).toEqual([]);
  // Keyboard: the plan cards are radios (visually hidden behind their card), picked with Space.
  const twoMeals = page.getByRole('radio', { name: /Breakfast \+ dinner/ });
  await twoMeals.focus();
  await page.keyboard.press('Space');
  await expect(twoMeals).toBeChecked();
  await page.getByRole('radio', { name: 'Non-veg' }).check();
  await page.getByRole('button', { name: 'Save change' }).click();
  await expect(page).toHaveURL(/\/account\?ok=/);
  await expect(page.getByText(/Food plan change saved\. It starts with your bill from \d+ \w+ \d{4}\./)).toBeVisible();
  await expect(page.getByText(/Food plan changes to Breakfast \+ dinner \(non-veg\) from \d+ \w+ \d{4}, with that bill\./)).toBeVisible();
  expect(await pageProblems(page, '/account with a food plan change')).toEqual([]);

  // Asking for the plan you already have says so in plain words.
  await page.goto('/account/food');
  await page.locator('label', { hasText: 'Full board' }).click();
  await expect(page.getByRole('radio', { name: /Full board/ })).toBeChecked();
  await page.getByRole('radio', { name: 'Veg', exact: true }).check();
  await page.getByRole('button', { name: 'Save change' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'already your food plan' })).toBeVisible();

  await page.goto('/account');
  await page.getByRole('button', { name: 'Keep my current plan' }).click();
  await expect(page.getByText('Food plan change cancelled. Your plan stays as it is.')).toBeVisible();
  await expect(page.getByText(/Food plan changes to/)).toHaveCount(0);
  await page.context().close();
});

test('3. cancel the plan: later skips earn no credit and the page says why; the paid bill has no pay button', async ({ browser }) => {
  const page = await signIn(browser, SUBSCRIBER, { next: '/account' });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel plan' }).click();
  await expect(page.getByText('Your plan will end at the close of the current billing period.')).toBeVisible();
  await expect(page.getByText(/Your plan ends on \d+ \w+ \d{4}\. No more bills after that\./)).toBeVisible();
  const meals = page.getByRole('region', { name: 'Meals' });
  await expect(meals.getByText('No credit — your plan ends before the next bill. Skipping still tells the kitchen to cook less.')).toBeVisible();
  await expect(meals.getByRole('button', { name: /^Skip \(save/ })).toHaveCount(0);
  await meals.getByRole('button', { name: /^Skip \(no credit\): / }).first().click();
  await expect(meals.getByText('Skipped · no credit').first()).toBeVisible();
  expect(await pageProblems(page, '/account after cancelling')).toEqual([]);

  // S8: the paid first bill says when it was paid and offers no way to pay it again, here or on its page.
  const bills = await apiGet<Bill[]>(SUBSCRIBER, '/me/invoices');
  const paid = bills.find((b) => b.status === 'paid')!;
  const row = page.getByRole('row').filter({ hasText: 'Paid' }).first();
  await expect(row).toContainText(/Paid \d+ \w+ \d{4}/);
  await expect(row.getByRole('link', { name: /^Pay/ })).toHaveCount(0);
  await page.goto(`/pay/${paid.id}`);
  await expect(page.getByRole('link', { name: 'Done' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0);
  await page.goBack();
  await page.goForward();
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0);
  expect(await pageProblems(page, '/pay for a paid bill')).toEqual([]);
  await page.context().close();
});

test('4. a session that ends mid-flow sends the resident to log in and back to the same page', async ({ browser }) => {
  const page = await signIn(browser, SUBSCRIBER, { next: '/account' });
  const cookie = (await page.context().cookies()).find((c) => c.name === 'hostels_session')!;
  // The session ends on the server (signed out elsewhere, or expired) while the page is open.
  await fetch(`${API}/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${cookie.value}` } });
  await page.getByRole('region', { name: 'Meals' }).getByRole('button', { name: /^Skip \(no credit\): / }).first().click();
  await expect(page).toHaveURL(/\/login\?next=%2Faccount/);

  await page.locator('input[name=phone]').fill(SUBSCRIBER);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.locator('input[name=otp]').fill(OTP);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('region', { name: 'Meals' })).toBeVisible();
  await page.context().close();
});
