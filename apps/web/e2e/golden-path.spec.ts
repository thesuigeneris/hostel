import { type Browser, expect, type Page, test } from '@playwright/test';

/**
 * The golden path from the platform spec and the personas addendum:
 * owner lists a hostel → admin approves and verifies it → a tenant subscribes and pays (stub)
 * → the tenant skips a meal (API) → the owner's headcount reflects it;
 * then a resident reports an issue → the owner resolves it → the resident confirms and leaves a verified review.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const OTP = '123456';
const ADMIN = '9000000001';
const DEMO_OWNER = '9000000002';
const DEMO_TENANT = '9000000003';

const run = Date.now().toString().slice(-7);
const ownerPhone = `961${run}`;
const tenantPhone = `962${run}`;
const hostelName = `Golden Path Hostel ${run}`;

/** Tomorrow in IST, as YYYY-MM-DD. */
function tomorrowIst() {
  return new Date(Date.now() + (5.5 + 24) * 3_600_000).toISOString().slice(0, 10);
}

async function login(browser: Browser, phone: string, opts: { owner?: boolean; next?: string } = {}): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/login${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ''}`);
  await page.locator('input[name=phone]').fill(phone);
  if (opts.owner) await page.getByLabel('I own or run a hostel').check();
  await page.getByRole('button', { name: /send|code|continue/i }).click();
  await page.locator('input[name=otp]').fill(OTP);
  await page.locator('input[name=name]').fill(opts.owner ? 'Golden Owner' : 'Golden Tenant');
  await page.getByRole('button', { name: /log in|verify|continue/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  return page;
}

async function apiToken(phone: string) {
  await fetch(`${API}/auth/otp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
  const res = await fetch(`${API}/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, otp: OTP }) });
  return ((await res.json()) as { token: string }).token;
}

test('owner to admin to tenant to resident', async ({ browser }) => {
  let hostelPath = '';
  let slug = '';
  const tomorrow = tomorrowIst();

  await test.step('owner lists a hostel', async () => {
    const owner = await login(browser, ownerPhone, { owner: true, next: '/owner/hostels/new' });
    await expect(owner).toHaveURL(/\/owner\/hostels\/new/);
    await owner.locator('input[name=name]').fill(hostelName);
    await owner.locator('input[name=area]').fill('Gachibowli');
    await owner.locator('input[name=address]').fill('Plot 7, near DLF gate 2');
    await owner.locator('input[name=contactPhone]').fill(ownerPhone);
    await owner.getByRole('button', { name: 'Create listing' }).click();
    await expect(owner).toHaveURL(/\/rooms/);
    hostelPath = new URL(owner.url()).pathname.replace(/\/rooms$/, '');

    await owner.locator('input[name=monthlyRent]').fill('9000');
    await owner.locator('input[name=totalBeds]').fill('6');
    await owner.locator('input[name=bedsAvailable]').fill('4');
    await owner.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(owner.getByText('Room added')).toBeVisible();

    await owner.goto(hostelPath);
    await owner.locator('input[name=photo]').setInputFiles('e2e/fixtures/room.png');
    await owner.getByRole('button', { name: 'Upload photo' }).click();
    await expect(owner.getByText('Photo added')).toBeVisible();
    await owner.getByRole('button', { name: 'Submit for review' }).click();
    await expect(owner.getByText(/Sent for review/)).toBeVisible();
    await owner.goto(`${hostelPath}/plan`);
    await expect(owner.getByText('You can apply once your listing is live.')).toBeVisible();
    await owner.context().close();
  });

  const admin = await test.step('admin approves the listing', async () => {
    const page = await login(browser, ADMIN);
    await page.goto('/admin/listings?status=pending');
    const card = page.locator('div.rounded-2xl', { hasText: hostelName }).last();
    await card.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Listing is live')).toBeVisible();
    return page;
  });

  await test.step('owner applies to be a partner', async () => {
    const owner = await login(browser, ownerPhone, { next: `${hostelPath}/plan` });
    await owner.getByRole('button', { name: 'Apply to become a partner' }).click();
    await expect(owner.getByText(/Partner application sent/)).toBeVisible();
    await owner.context().close();
  });

  await test.step('admin verifies the partner after the visit', async () => {
    await admin.goto('/admin/partners');
    const app = admin.locator('div.rounded-2xl', { hasText: hostelName }).last();
    await app.getByRole('button', { name: 'Verify' }).click();
    await expect(admin.getByText('Partner verified')).toBeVisible();
    await admin.context().close();
  });

  await test.step('a tenant subscribes and pays', async () => {
    const tenant = await login(browser, tenantPhone);
    await tenant.goto(`/hostels?q=${encodeURIComponent(hostelName)}`);
    await tenant.getByRole('link', { name: hostelName, exact: true }).click();
    await expect(tenant.getByText('Verified partner · no advance')).toBeVisible();
    slug = new URL(tenant.url()).pathname.split('/').pop()!;
    // The photo the owner uploaded is served by the API and loads on the website.
    await expect.poll(() => tenant.locator('main img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await tenant.getByRole('link', { name: 'Subscribe' }).click();
    await tenant.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(tenant).toHaveURL(/\/pay\//);
    await tenant.getByRole('button', { name: /simulated/ }).click();
    await expect(tenant.getByText('Payment received. Thank you!')).toBeVisible();
    await tenant.goto('/account');
    await expect(tenant.getByText(hostelName)).toBeVisible();
    await tenant.context().close();
  });

  await test.step('the tenant skips tomorrow’s lunch through the API', async () => {
    const token = await apiToken(tenantPhone);
    const res = await fetch(`${API}/me/skips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: tomorrow, meal: 'lunch' }),
    });
    expect(res.status).toBe(201);
  });

  await test.step('the owner sees it in the kitchen headcount', async () => {
    const owner = await login(browser, ownerPhone);
    await owner.goto(`${hostelPath}/kitchen?date=${tomorrow}`);
    const lunch = owner.locator('div', { has: owner.getByText('lunch', { exact: true }) }).filter({ hasText: 'skipped' }).last();
    await expect(lunch).toContainText('1 skipped');
    await expect(owner.getByText(`+91 ${tenantPhone}`)).toBeVisible();
    await owner.context().close();
  });

  const issueTitle = `Bathroom tap leaking ${run}`;
  let issuePath = '';
  let homeId = '';

  await test.step('a resident reports an issue', async () => {
    const resident = await login(browser, DEMO_TENANT);
    await resident.goto('/stay');
    await resident.getByRole('link', { name: 'Report an issue' }).first().click();
    await resident.waitForURL(/\/stay\/hst_/);
    homeId = new URL(resident.url()).pathname.split('/').pop()!;
    await resident.locator('input[name=title]').fill(issueTitle);
    await resident.locator('textarea[name=description]').fill('Third floor, left bathroom. Dripping all night.');
    await resident.getByRole('button', { name: 'Report issue' }).click();
    await expect(resident).toHaveURL(/\/issues\//);
    issuePath = new URL(resident.url()).pathname;
    await resident.context().close();
  });

  await test.step('the owner resolves it', async () => {
    const owner = await login(browser, DEMO_OWNER);
    await owner.goto('/owner/issues');
    await owner.getByRole('link', { name: new RegExp(issueTitle) }).click();
    await owner.locator('textarea[name=message]').fill('Plumber replaced the washer this morning.');
    await owner.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(owner.getByText('Plumber replaced the washer this morning.')).toBeVisible();
    await owner.context().close();
  });

  await test.step('the resident confirms the fix and leaves a verified review', async () => {
    const resident = await login(browser, DEMO_TENANT);
    await resident.goto(issuePath);
    await resident.getByRole('button', { name: 'Confirm fixed' }).click();
    await expect(resident.getByText('closed').first()).toBeVisible();

    const reviewText = `Clean rooms and the owner fixed our tap within a day (${run}).`;
    await resident.goto(`/stay/${homeId}?tab=review`);
    await resident.locator('select[name=rating]').selectOption('5');
    await resident.locator('textarea[name=body]').fill(reviewText);
    await resident.getByRole('button', { name: /Post review|Update review/ }).click();
    await expect(resident.getByText('Thanks! Your review is live.')).toBeVisible();

    const stays = await (await fetch(`${API}/me/residencies`, { headers: { authorization: `Bearer ${await apiToken(DEMO_TENANT)}` } })).json();
    const home = (stays as { hostel: { id: string; slug: string } }[]).find((s) => s.hostel.id === homeId)!;
    await resident.goto(`/hostels/${home.hostel.slug}`);
    const review = resident.locator('div.rounded-2xl', { hasText: reviewText });
    await expect(review).toBeVisible();
    await expect(review.getByText('✓ Verified stay · paid through Hostels')).toBeVisible();
    await resident.context().close();
  });

  expect(slug).not.toBe('');
});
