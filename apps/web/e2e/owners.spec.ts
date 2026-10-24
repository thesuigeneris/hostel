import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const PHONE = `955${Date.now().toString().slice(-7)}`;

// PRP-12 batch 3: owner acquisition page and the onboarding progress for a new listing.

test('for-owners: plans from real prices, steps, FAQ, and no invented numbers', async ({ page }) => {
  await page.goto('/for-owners');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'From sign-up to live' })).toBeVisible();
  await expect(page.getByText('₹999')).toBeVisible();
  await expect(page.getByText('₹1,999').first()).toBeVisible();
  await expect(page.getByText(/thousands of|students and young professionals look/i)).toHaveCount(0);
  const faq = page.locator('details', { hasText: 'How does Partner verification work?' });
  await faq.locator('summary').click();
  await expect(faq.getByText('visits in person')).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes[0]?.target} ${v.nodes[0]?.failureSummary}`)).toEqual([]);
});

test('a new listing shows where it is on the way to going live', async ({ browser }) => {
  const owner = await signIn(browser, PHONE, { owner: true, name: 'Asha', next: '/owner/hostels/new' });
  const progress = owner.getByRole('navigation', { name: 'Listing progress' });
  await expect(progress.getByText('Step 1 of 4: Details')).toBeVisible();

  await owner.locator('input[name=name]').fill('Onboarding Test PG');
  await owner.locator('select[name=genderType]').selectOption('girls');
  await owner.locator('input[name=area]').fill('Madhapur');
  await owner.locator('input[name=address]').fill('Road 36, Madhapur');
  await owner.locator('input[name=contactPhone]').fill(PHONE);
  await owner.getByRole('button', { name: 'Create listing' }).click();
  await expect(owner).toHaveURL(/\/owner\/hostels\/hst_[a-z0-9]+\/rooms/);
  await expect(progress.getByText('Step 2 of 4: Rooms and prices')).toBeVisible();
  await expect(progress.locator('li[aria-current="step"]')).toContainText('Rooms and prices');
  await expect(owner.getByRole('navigation', { name: 'Hostel sections' }).getByRole('link', { name: 'Rooms' })).toHaveAttribute('aria-current', 'page');

  await owner.locator('select[name=sharing]').selectOption('3-sharing');
  await owner.locator('input[name=monthlyRent]').fill('7000');
  await owner.locator('input[name=totalBeds]').fill('9');
  await owner.locator('input[name=bedsAvailable]').fill('3');
  await owner.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(owner.getByText('Room added')).toBeVisible();
  await expect(progress.getByText('Step 3 of 4: Photos')).toBeVisible();
  await expect(owner.getByText(/^Beds updated /)).toBeVisible();
});
