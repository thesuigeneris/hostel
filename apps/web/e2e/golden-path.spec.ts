import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { DEMO, apiGet, apiToken, signIn } from './helpers';

const stamp = Date.now().toString().slice(-6);
const OWNER_PHONE = `91234${stamp.slice(-5)}`;
const SEEKER_PHONE = `93456${stamp.slice(-5)}`;
const HOSTEL = `Lotus Co-living ${stamp}`;

test.describe.configure({ mode: 'serial' });

let hostelId = '';
let hostelSlug = '';

test('owner lists a hostel; admin approves it and verifies the partner', async ({ page }) => {
  // Owner signs up from the owner pitch and creates a listing.
  await page.goto('/for-hostels');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await signIn(page, OWNER_PHONE, { owner: true, name: 'Meena Rao', next: '/owner/hostels/new' });
  await expect(page).toHaveURL(/\/owner\/hostels\/new/);

  await page.getByLabel('Hostel name').fill(HOSTEL);
  await page.getByLabel('Description').fill('Bright rooms near Kondapur bus stop, home food and fast WiFi.');
  await page.getByLabel('Who can stay').selectOption('coliving');
  await page.getByRole('combobox', { name: /^Food/ }).selectOption({ label: 'We serve food' });
  await page.getByLabel('Contact phone').fill('9848012345');
  await page.getByLabel('City').fill('Hyderabad');
  await page.getByLabel('Area / locality').fill('Kondapur');
  await page.getByLabel('Full address').fill('Plot 12, Botanical Garden Road, Kondapur');
  await page.locator('.leaflet-container').click({ position: { x: 200, y: 120 } });
  await expect(page.getByText(/^\d+\.\d{5}, \d+\.\d{5}$/)).toBeVisible();
  await page.getByRole('button', { name: 'Create listing' }).click();

  await expect(page).toHaveURL(/\/owner\/hostels\/hst_[a-z0-9]+\/rooms/);
  hostelId = page.url().match(/hst_[a-z0-9]+/)![0];

  // Rooms
  await page.getByLabel('Sharing').selectOption('2-sharing');
  await page.getByLabel('Rent / bed (₹)').fill('8500');
  await page.getByLabel('Total beds').last().fill('10');
  await page.getByLabel('Beds free now').fill('4');
  await page.getByRole('button', { name: 'Add room' }).click();
  await expect(page.getByText('₹8,500').first()).toBeVisible();

  // Photos
  await page.goto(`/owner/hostels/${hostelId}/photos`);
  await page.locator('input[type=file]').setInputFiles(fileURLToPath(new URL('./fixtures/room.png', import.meta.url)));
  await expect(page.locator('img[src*="/uploads/"]').first()).toBeVisible();

  // Submit for review
  await page.goto(`/owner/hostels/${hostelId}/status`);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText(/in review|pending/i).first()).toBeVisible();

  // Admin approves the listing
  await signIn(page, DEMO.admin, { next: '/admin/listings' });
  const row = page.locator('tr, li, [data-hostel-row], div.rounded-\\[var\\(--radius-card\\)\\]').filter({ hasText: HOSTEL }).last();
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  // Owner applies to be a partner, admin verifies
  await signIn(page, OWNER_PHONE, { next: `/owner/hostels/${hostelId}/status` });
  await page.getByRole('button', { name: 'Apply to become a partner' }).click();
  await expect(page.getByText('Application received')).toBeVisible();

  await signIn(page, DEMO.admin, { next: '/admin/partners' });
  const app = page.locator('tr, li, div.rounded-\\[var\\(--radius-card\\)\\]').filter({ hasText: HOSTEL }).last();
  await app.getByRole('button', { name: 'Verify' }).click();

  const owner = await apiToken(OWNER_PHONE);
  const h = await apiGet(owner, `/owner/hostels/${hostelId}`);
  expect(h.status).toBe('live');
  expect(h.partnerStatus).toBe('verified');
  hostelSlug = h.slug;
});

test('seeker finds the hostel, subscribes with no advance and pays', async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(HOSTEL)}`);
  await page.getByRole('link', { name: new RegExp(HOSTEL) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/hostels/${hostelSlug}`));
  await expect(page.getByText('Verified').first()).toBeVisible();

  await page.getByRole('link', { name: 'Subscribe, no advance' }).click();
  await signIn(page, SEEKER_PHONE, { name: 'Kiran', next: `/subscribe/${hostelSlug}` });
  await expect(page).toHaveURL(new RegExp(`/subscribe/${hostelSlug}`));

  // Wizard: room → food → start date → summary
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Continue to payment/ }).click();

  await expect(page).toHaveURL(/\/pay\/inv_/);
  await page.getByRole('button', { name: 'Simulate successful payment' }).click();
  await page.getByRole('link', { name: 'Go to my stay' }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText(HOSTEL).first()).toBeVisible();
  await expect(page.getByText('Active').first()).toBeVisible();

  // Subscription made them a resident: the community board is open to them.
  await page.goto('/community');
  await expect(page.getByText(HOSTEL).first()).toBeVisible();
});

test('owner upgrades to Pro and pays the software invoice', async ({ page }) => {
  await signIn(page, OWNER_PHONE, { next: `/owner/hostels/${hostelId}/status` });
  await page.getByRole('button', { name: /Upgrade to Pro/ }).click();
  await expect(page).toHaveURL(/\/pay\/sin_/);
  await page.getByRole('button', { name: 'Simulate successful payment' }).click();
  await expect(page.getByRole('link', { name: 'Back to billing' })).toBeVisible();

  const owner = await apiToken(OWNER_PHONE);
  expect((await apiGet(owner, `/owner/hostels/${hostelId}`)).ownerPlan).toBe('pro');
});

test('resident reports an issue; owner resolves it; resident confirms; it shows publicly', async ({ page }) => {
  const title = `No hot water on 2nd floor ${stamp}`;
  const tenant = await apiToken(DEMO.tenant);
  const mine = await apiGet(tenant, '/me/residencies');
  const home = mine.residencies.find((r: any) => r.status === 'active');
  const hid = home.hostelId as string;

  await signIn(page, DEMO.tenant, { next: `/community/${hid}/issues` });
  await page.getByRole('button', { name: 'Report an issue' }).click();
  await page.getByLabel('Category').selectOption('water');
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByLabel("What's happening?").fill('Geyser on the 2nd floor has been cold since yesterday morning.');
  await page.getByRole('button', { name: 'Submit issue' }).click();
  await expect(page).toHaveURL(/\/issues\/iss_/);
  const issueId = page.url().match(/iss_[a-z0-9]+/)![0];

  // Owner sees it in the issue desk and resolves it with a note.
  await signIn(page, DEMO.owner, { next: `/owner/issues/${issueId}` });
  await expect(page.getByText(title)).toBeVisible();
  await page.getByLabel('Note to resident (optional)').fill('Plumber fixed the heating element.');
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(page.getByText('Resolved').first()).toBeVisible();

  // Resident confirms the fix.
  await signIn(page, DEMO.tenant, { next: `/community/${hid}/issues/${issueId}` });
  await expect(page.getByText('Plumber fixed the heating element.')).toBeVisible();
  await page.getByRole('button', { name: /Yes, it.s fixed/ }).click();
  await expect(page.getByText('Closed').first()).toBeVisible();

  // Public transparency board shows it (reporter hidden).
  await page.context().clearCookies();
  await page.goto(`/hostels/${home.hostel.slug}`);
  await expect(page.getByText(title)).toBeVisible();
});

test('resident reviews the hostel and the owner replies publicly', async ({ page }) => {
  const tenant = await apiToken(SEEKER_PHONE);
  const mine = await apiGet(tenant, '/me/residencies');
  const hid = mine.residencies[0].hostelId as string;
  const headline = `Great food, quick fixes ${stamp}`;

  await signIn(page, SEEKER_PHONE, { next: `/community/${hid}/review` });
  for (const group of await page.getByRole('radiogroup').all()) await group.getByRole('radio', { name: '4 stars' }).click();
  await page.getByLabel('Headline').fill(headline);
  await page.getByLabel('Your experience').fill('Rooms are clean, the food rotates every week and the owner answers on the board.');
  await page.getByRole('button', { name: 'Publish review' }).click();
  await expect(page.getByText(/published|thanks/i).first()).toBeVisible();

  await signIn(page, OWNER_PHONE, { next: '/owner/reviews' });
  await expect(page.getByText(headline)).toBeVisible();
  await page.getByPlaceholder("Thank the resident and say what you've changed.").first().fill('Thank you Kiran! WiFi upgrade is next.');
  await page.getByRole('button', { name: 'Post public reply' }).first().click();
  await expect(page.getByRole('button', { name: 'Edit reply' }).first()).toBeVisible();

  await page.context().clearCookies();
  await page.goto(`/hostels/${hostelSlug}`);
  await expect(page.getByText(headline)).toBeVisible();
  await expect(page.getByText('Thank you Kiran! WiFi upgrade is next.')).toBeVisible();
});

test('tenant skips a meal and the kitchen headcount drops', async ({ page }) => {
  await signIn(page, DEMO.tenant, { next: '/account/menu' });
  const toggle = page.locator('input[type=checkbox][aria-label^="Skip "]:not(:checked):not(:disabled)').first();
  const label = (await toggle.getAttribute('aria-label'))!; // "Skip Dinner on 2026-10-25"
  const [, mealLabel, date] = label.match(/^Skip (\w+) on (\d{4}-\d{2}-\d{2})$/)!;
  const meal = mealLabel!.toLowerCase();
  const tenant = await apiToken(DEMO.tenant);
  const stay = await apiGet(tenant, '/me/stay');
  const owner = await apiToken(DEMO.owner);
  const before = await apiGet(owner, `/owner/hostels/${stay.hostel.id}/headcount?date=${date}`);
  await toggle.check();
  await expect(page.getByText('Skipped').first()).toBeVisible();
  await expect
    .poll(async () => {
      const after = await apiGet(owner, `/owner/hostels/${stay.hostel.id}/headcount?date=${date}`);
      return after.meals.find((m: any) => m.meal === meal).skipped - before.meals.find((m: any) => m.meal === meal).skipped;
    })
    .toBe(1);
});
