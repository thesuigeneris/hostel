import { expect, test } from '@playwright/test';
import { ADMIN, DEMO_OWNER, apiGet, publicGet, signIn } from './helpers';

/**
 * Six persona flows through the website, each checking what the other side sees:
 * 1. an owner lists a hostel and becomes a verified partner (admin approves and verifies);
 * 2. a seeker finds it, subscribes with no advance and pays;
 * 3. an owner moves a Free hostel to Pro (free first month) and pays a plan bill on another;
 * 4. a resident's issue is acknowledged, resolved and confirmed, and the public issue record counts it;
 * 5. a resident reviews the hostel and the owner's public reply shows on the listing;
 * 6. a tenant skips a meal and the kitchen headcount drops by one.
 */

test.describe.configure({ mode: 'serial' });

const run = Date.now().toString().slice(-7);
const OWNER = `971${run}`;
const SEEKER = `972${run}`;
const HOSTEL = `Lotus Co-living ${run}`;
// Seeded people (see apps/api/src/db/seed.ts).
const PRO_OWNER = '9000000004'; // owns Sri Sai PG (Pro) and Lakshmi Ladies Hostel (Free)
const RESIDENT = '9000000101'; // subscriber at Sunrise Residency for over a month, no review yet
const DINER = '9000000104'; // full-board subscriber at a partner hostel

type Stay = { status: string; hostel: { id: string; slug: string; name: string } };
type OwnedHostel = { id: string; name: string; slug: string; status: string; partnerStatus: string };

let hostelId = '';
let hostelSlug = '';

test('1. owner lists a hostel; admin approves it and verifies the partner', async ({ browser }) => {
  const owner = await signIn(browser, OWNER, { owner: true, name: 'Meena Rao', next: '/owner/hostels/new' });
  await expect(owner).toHaveURL(/\/owner\/hostels\/new/);
  await owner.locator('input[name=name]').fill(HOSTEL);
  await owner.locator('select[name=genderType]').selectOption('coliving');
  await owner.locator('input[name=area]').fill('Kondapur');
  await owner.locator('input[name=address]').fill('Plot 12, Botanical Garden Road');
  await owner.locator('input[name=contactPhone]').fill(OWNER);
  await owner.locator('textarea[name=description]').fill('Bright rooms near the Kondapur bus stop, home food and fast WiFi.');
  await owner.getByLabel('WiFi').check();
  await owner.getByLabel('Hot water').check();
  // Drop the map pin away from the default city-centre point.
  const coords = owner.getByText('17.44350, 78.37720');
  await expect(coords).toBeVisible();
  await owner.locator('.leaflet-container').click({ position: { x: 120, y: 80 } });
  await expect(coords).toHaveCount(0);
  await owner.getByRole('button', { name: 'Create listing' }).click();
  await expect(owner).toHaveURL(/\/owner\/hostels\/hst_[a-z0-9]+\/rooms/);
  hostelId = owner.url().match(/hst_[a-z0-9]+/)![0];

  await owner.locator('select[name=sharing]').selectOption('2-sharing');
  await owner.locator('input[name=monthlyRent]').fill('8500');
  await owner.locator('input[name=totalBeds]').fill('10');
  await owner.locator('input[name=bedsAvailable]').fill('4');
  await owner.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(owner.getByText('Room added')).toBeVisible();

  await owner.goto(`/owner/hostels/${hostelId}`);
  await owner.locator('input[name=photo]').setInputFiles('e2e/fixtures/room.png');
  await owner.getByRole('button', { name: 'Upload photo' }).click();
  await expect(owner.getByText('Photo added')).toBeVisible();
  await owner.getByRole('button', { name: 'Submit for review' }).click();
  await expect(owner.getByText(/Sent for review/)).toBeVisible();
  await owner.context().close();

  const admin = await signIn(browser, ADMIN, { next: '/admin/listings?status=pending' });
  await admin.locator('div.rounded-2xl', { hasText: HOSTEL }).last().getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Listing is live')).toBeVisible();

  const owner2 = await signIn(browser, OWNER, { next: `/owner/hostels/${hostelId}/plan` });
  await owner2.getByRole('button', { name: 'Apply to become a partner' }).click();
  await expect(owner2.getByText(/Partner application sent/)).toBeVisible();
  await owner2.context().close();

  await admin.goto('/admin/partners');
  await admin.locator('div.rounded-2xl', { hasText: HOSTEL }).last().getByRole('button', { name: 'Verify' }).click();
  await expect(admin.getByText('Partner verified')).toBeVisible();
  await admin.context().close();

  const h = await apiGet<OwnedHostel>(OWNER, `/owner/hostels/${hostelId}`);
  expect(h.status).toBe('live');
  expect(h.partnerStatus).toBe('verified');
  hostelSlug = h.slug;
});

test('2. seeker finds the hostel, subscribes with no advance and pays', async ({ browser }) => {
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/hostels?q=${encodeURIComponent(HOSTEL)}`);
  await visitor.getByRole('link', { name: HOSTEL, exact: true }).click();
  await expect(visitor).toHaveURL(new RegExp(`/hostels/${hostelSlug}`));
  await expect(visitor.getByText('Verified partner · no advance')).toBeVisible();
  await visitor.getByRole('link', { name: 'Subscribe' }).click();
  // Signed-out visitors are sent to log in and come back to the subscribe page.
  await expect(visitor).toHaveURL(/\/login/);
  await visitor.context().close();

  const seeker = await signIn(browser, SEEKER, { name: 'Kiran', next: `/subscribe/${hostelSlug}` });
  await expect(seeker).toHaveURL(new RegExp(`/subscribe/${hostelSlug}`));
  await expect(seeker.getByText(/no advance/i).first()).toBeVisible();
  await seeker.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(seeker).toHaveURL(/\/pay\/inv_/);
  await seeker.getByRole('button', { name: /simulated/ }).click();
  await expect(seeker.getByText('Payment received. Thank you!')).toBeVisible();

  await seeker.goto('/account');
  await expect(seeker.getByText(HOSTEL).first()).toBeVisible();
  // Subscribing made them a resident: their hostel's community is open.
  await seeker.goto('/stay');
  await expect(seeker.getByText(HOSTEL).first()).toBeVisible();
  await seeker.goto(`/stay/${hostelId}?tab=community`);
  await expect(seeker.locator('textarea[name=body]')).toBeVisible();
  await seeker.context().close();
});

test('3. owner moves a Free hostel to Pro and pays a plan bill', async ({ browser }) => {
  const hostels = await apiGet<OwnedHostel[]>(PRO_OWNER, '/owner/hostels');
  const free = hostels.find((h) => h.name === 'Lakshmi Ladies Hostel')!;
  const pro = hostels.find((h) => h.name === 'Sri Sai PG')!;

  // The first paid plan on a hostel comes with a free month, so switching creates no bill yet.
  const owner = await signIn(browser, PRO_OWNER, { next: `/owner/hostels/${free.id}/plan` });
  await owner.getByRole('button', { name: 'Switch to Pro' }).click();
  await expect(owner.getByText('Plan updated')).toBeVisible();
  await expect(owner.getByText(/Free trial until/)).toBeVisible();
  await expect(owner.locator('div.rounded-2xl', { hasText: 'Adds the resident register' }).getByText('Current')).toBeVisible();

  // The Pro hostel's trial ended last month; running the billing job issues this period's plan bill.
  const admin = await signIn(browser, ADMIN, { next: '/admin' });
  await admin.getByRole('button', { name: 'Run jobs now' }).click();
  await expect(admin.locator('main')).toBeVisible();
  await admin.context().close();

  await owner.goto(`/owner/hostels/${pro.id}/plan`);
  await expect(owner.getByText('Plan bill ready')).toBeVisible();
  await owner.getByRole('link', { name: 'Pay now' }).click();
  await expect(owner).toHaveURL(/\/pay\//);
  await owner.getByRole('button', { name: /simulated/ }).click();
  await expect(owner.getByText('Payment received. Thank you!')).toBeVisible();
  await owner.goto(`/owner/hostels/${pro.id}/plan`);
  await expect(owner.getByText('Plan bill ready')).toHaveCount(0);
  await owner.context().close();
});

test('4. resident reports an issue; owner acknowledges and resolves; resident confirms; public record counts it', async ({ browser }) => {
  const stays = await apiGet<Stay[]>(RESIDENT, '/me/residencies');
  const home = stays.find((s) => s.status === 'active')!.hostel;
  const before = (await publicGet<{ transparency: { reported: number } | null }>(`/hostels/${home.slug}`)).transparency?.reported ?? 0;
  const title = `No hot water on 2nd floor ${run}`;

  const resident = await signIn(browser, RESIDENT, { next: `/stay/${home.id}?tab=issues` });
  await resident.locator('select[name=category]').selectOption('water');
  await resident.locator('input[name=title]').fill(title);
  await resident.locator('textarea[name=description]').fill('Geyser on the 2nd floor has been cold since yesterday morning.');
  await resident.getByRole('button', { name: 'Report issue' }).click();
  await expect(resident).toHaveURL(/\/issues\//);
  const issuePath = new URL(resident.url()).pathname;
  await resident.context().close();

  const owner = await signIn(browser, DEMO_OWNER, { next: '/owner/issues' });
  await owner.getByRole('link', { name: new RegExp(title) }).click();
  await expect(owner).toHaveURL(new RegExp(issuePath));
  await owner.locator('textarea[name=message]').fill('Seen it. Plumber is booked for 4 pm.');
  await owner.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(owner.getByText('Seen it. Plumber is booked for 4 pm.')).toBeVisible();
  await owner.locator('textarea[name=message]').fill('Plumber replaced the heating element.');
  await owner.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(owner.getByText('Plumber replaced the heating element.')).toBeVisible();
  await owner.context().close();

  const back = await signIn(browser, RESIDENT, { next: issuePath });
  await back.getByRole('button', { name: 'Confirm fixed' }).click();
  await expect(back.getByText('closed').first()).toBeVisible();
  await back.context().close();

  // The public listing shows only aggregate numbers; issue details stay private to residents.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/hostels/${home.slug}`);
  await expect(visitor.getByText(/Issue record, last \d+ days/)).toBeVisible();
  // The figure is the <dd> paired with the "issues reported" <dt>.
  await expect(visitor.locator('dt', { hasText: 'issues reported' }).locator('xpath=following-sibling::dd[1]')).toHaveText(String(before + 1));
  await expect(visitor.getByText(title)).toHaveCount(0);
  await visitor.context().close();
});

test('5. resident reviews the hostel; the owner replies publicly', async ({ browser }) => {
  const stays = await apiGet<Stay[]>(RESIDENT, '/me/residencies');
  const home = stays.find((s) => s.status === 'active')!.hostel;
  const body = `Rooms are clean, food rotates every week and the owner answers fast (${run}).`;
  const reply = `Thank you! WiFi upgrade is next (${run}).`;

  const resident = await signIn(browser, RESIDENT, { next: `/stay/${home.id}?tab=review` });
  await resident.locator('select[name=rating]').selectOption('5');
  await resident.locator('select[name=food]').selectOption('4');
  await resident.locator('textarea[name=body]').fill(body);
  await resident.getByRole('button', { name: 'Post review' }).click();
  await expect(resident.getByText('Thanks! Your review is live.')).toBeVisible();
  await resident.context().close();

  const owner = await signIn(browser, DEMO_OWNER, { next: `/owner/hostels/${home.id}/reviews` });
  const card = owner.locator('div.rounded-2xl', { hasText: body }).last();
  await card.locator('textarea[name=reply]').fill(reply);
  await card.getByRole('button', { name: 'Reply' }).click();
  await expect(owner.getByText('Reply posted')).toBeVisible();
  await owner.context().close();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/hostels/${home.slug}`);
  const review = visitor.locator('div.rounded-2xl', { hasText: body });
  await expect(review).toBeVisible();
  await expect(review.getByText(reply)).toBeVisible();
  await expect(review.getByText('Reply from the hostel:')).toBeVisible();
  await visitor.context().close();
});

test('6. tenant skips a meal and the kitchen headcount drops by one', async ({ browser }) => {
  const stays = await apiGet<Stay[]>(DINER, '/me/residencies');
  const home = stays.find((s) => s.status === 'active')!.hostel;
  const tenant = await signIn(browser, DINER, { next: '/account' });
  const form = tenant.locator('form', { has: tenant.getByRole('button', { name: /^Skip \(save/ }) }).first();
  const date = await form.locator('input[name=date]').inputValue();
  const meal = await form.locator('input[name=meal]').inputValue();

  type Headcount = { meals: { meal: string; skipped: number }[] };
  const skipped = async () => (await apiGet<Headcount>(DEMO_OWNER, `/owner/hostels/${home.id}/headcount?date=${date}`)).meals.find((m) => m.meal === meal)!.skipped;
  const before = await skipped();
  await form.getByRole('button', { name: /^Skip \(save/ }).click();
  await expect(tenant.getByText(/Skipped · −₹/).first()).toBeVisible();
  await expect.poll(skipped).toBe(before + 1);
  await tenant.context().close();

  // The owner's kitchen page shows the same number.
  const owner = await signIn(browser, DEMO_OWNER, { next: `/owner/hostels/${home.id}/kitchen?date=${date}` });
  const row = owner.locator('div', { has: owner.getByText(meal, { exact: true }) }).filter({ hasText: 'skipped' }).last();
  await expect(row).toContainText(`${before + 1} skipped`);
  await owner.context().close();
});
