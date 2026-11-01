import AxeBuilder from '@axe-core/playwright';
import { type Area, type HostelDetail, PENDING_SUBSCRIPTION_TTL_MINUTES, type SearchResult, TRANSPARENCY_MIN_ISSUES } from '@hostels/shared';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { API, apiToken, OTP, publicGet, signIn } from './helpers';

/**
 * Seeker journeys S1–S8 from docs/product/acceptance.md and docs/product/edge-cases.md: suggestions while typing
 * (keyboard and without JavaScript), filters in the URL with the back button, no-results recovery, the past-the-end
 * page, trust panels on a hostel page, visit requests, subscribing with the bed hold, an expired session, and a
 * paid bill that can't be paid twice.
 */

test.describe.configure({ mode: 'serial' });

const run = Date.now().toString().slice(-6);
const SEEKER = `9811${run}`;
const LATE_SEEKER = `9822${run}`;
const CHANGED_MIND = `9833${run}`;
const FREE_OWNER = '9000000004'; // Ravi Kumar owns Sri Sai PG, a free listing (seed-data.ts)

async function noSeriousAxe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const pinsOnly = (v: { id: string; nodes: { target: unknown[] }[] }) =>
    v.id === 'target-size' && v.nodes.every((n) => String(n.target.at(-1)).startsWith('div[title='));
  const bad = result.violations
    .filter((v) => (v.impact === 'serious' || v.impact === 'critical') && !pinsOnly(v))
    .map((v) => `${label}: ${v.id} (${v.nodes[0]?.target}) ${v.nodes[0]?.failureSummary?.replace(/\s+/g, ' ')}`);
  expect(bad).toEqual([]);
}

async function fits(page: Page, label: string) {
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    expect(sw, `${label} overflows at ${width}px`).toBeLessThanOrEqual(vw + 1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function hostelNamed(name: string) {
  const res = await publicGet<SearchResult>(`/hostels?q=${encodeURIComponent(name)}`);
  const h = res.items.find((x) => x.name === name);
  expect(h, `seeded hostel ${name}`).toBeTruthy();
  return h!;
}

/** Logs in through the OTP form, as a returning visitor would after a session ends. */
async function logInWithCode(page: Page, phone: string) {
  await page.locator('input[name=phone]').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.locator('input[name=otp]').fill(OTP);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
}

async function newSeeker(browser: Browser, phone: string, next: string) {
  return signIn(browser, phone, { name: 'Seeker Journeys', next });
}

test('S1: suggestions while typing, chosen with the keyboard, and the search still works without JavaScript', async ({ page, browser }) => {
  await page.goto('/');
  const box = page.getByRole('combobox', { name: 'Area or hostel name' });
  await box.click();
  await box.pressSequentially('hite', { delay: 30 });
  const list = page.getByRole('listbox', { name: 'Suggestions' });
  await expect(list).toBeVisible();
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  const options = list.getByRole('option');
  await expect(options.first()).toContainText('HiTech City');
  await expect(options.first()).toContainText(/Area · \d+ hostels?/);
  await expect(list.getByRole('option', { name: /Habitat HiTech/ })).toBeVisible();
  await expect(page.locator('output[aria-live]').filter({ hasText: /suggestions?\. Use the up and down arrows/ })).toHaveCount(1);
  await noSeriousAxe(page, 'home with suggestions open');

  // Arrow keys move the highlight (aria-activedescendant), Escape closes, and Enter opens the pick.
  await box.press('ArrowDown');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  expect(await box.getAttribute('aria-activedescendant')).toBe(await options.first().getAttribute('id'));
  await box.press('ArrowUp');
  await expect(options.last()).toHaveAttribute('aria-selected', 'true');
  await box.press('Escape');
  await expect(box).toHaveAttribute('aria-expanded', 'false');
  await box.press('ArrowDown');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await box.press('Enter');
  await page.waitForURL('**/hostels-in/hitech-city');
  await expect(page.getByRole('heading', { level: 1, name: 'Hostels and PGs in HiTech City' })).toBeVisible();

  // On the search page an area pick keeps the filters already set in the form.
  await page.goto('/hostels?food=true');
  const filterBox = page.getByRole('search', { name: 'Filter hostels' }).getByRole('combobox', { name: 'Search' });
  await filterBox.pressSequentially('madh', { delay: 30 });
  await page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option', { name: /^Madhapur/ }).click();
  await page.waitForURL('**/hostels-in/madhapur?food=true');

  // Without JavaScript the same box is a plain search field in a GET form.
  const plain = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
  await plain.goto('/');
  await expect(plain.getByRole('combobox', { name: 'Area or hostel name' })).toHaveCount(0);
  await plain.getByRole('searchbox', { name: 'Area or hostel name' }).fill('Sunrise');
  await plain.getByRole('search', { name: 'Find a hostel' }).getByRole('button', { name: 'Search' }).click();
  await plain.waitForURL(/\/hostels\?q=Sunrise/);
  await expect(plain.getByRole('link', { name: 'Sunrise Residency', exact: true })).toBeVisible();
  await plain.context().close();

  // Popular areas come from live listings, busiest first.
  const areas = new Set((await publicGet<Area[]>('/areas')).map((a) => a.area));
  await page.goto('/');
  const texts = await page.getByRole('navigation', { name: 'Popular areas' }).getByRole('link').allTextContents();
  const shown = texts.map((t) => /^(.+?) · (\d+)$/.exec(t.replace(/\s+/g, ' ').trim())!).map((m) => ({ area: m[1]!, count: Number(m[2]) }));
  expect(shown.map((a) => a.area).every((a) => areas.has(a))).toBe(true);
  expect(shown.map((a) => a.count)).toEqual([...shown.map((a) => a.count)].sort((a, b) => b - a));
});

test('S2: filters live in the URL, the back button restores them, and no results says what to relax', async ({ page }) => {
  await page.goto('/hostels');
  const form = page.getByRole('search', { name: 'Filter hostels' });
  await form.getByLabel('Sharing').selectOption('2-sharing');
  await form.getByLabel('Food available').check();
  await form.getByRole('button', { name: 'Search' }).click();
  await page.waitForURL(/sharing=2-sharing/);
  expect(new URL(page.url()).searchParams.get('food')).toBe('true');

  await page.getByRole('link', { name: 'Remove filter: Food available' }).click();
  await page.waitForURL((u) => !u.searchParams.has('food'));
  await page.goBack();
  await page.waitForURL((u) => u.searchParams.get('food') === 'true');
  await expect(page.getByRole('search', { name: 'Filter hostels' }).getByLabel('Food available')).toBeChecked();

  // Nothing matches: each single change that would find hostels is offered with its count.
  await page.goto('/hostels?q=Lakshmi&verified=true');
  await expect(page.getByText('No hostels match these filters')).toBeVisible();
  const widen = page.getByRole('list', { name: 'Ways to widen this search' });
  await expect(widen.getByRole('link', { name: /^Remove Verified partners only\s*· 1 hostel$/ })).toHaveAttribute('href', '/hostels?q=Lakshmi');
  await expect(widen.getByRole('link', { name: /^Remove “Lakshmi”\s*· \d+ hostels$/ })).toBeVisible();
  await noSeriousAxe(page, 'no results');
  await fits(page, 'no results');

  // An area page offers every area when the hostel is elsewhere.
  await page.goto('/hostels-in/madhapur?q=Sunrise');
  await page.getByRole('link', { name: /^Look in every area\s*· 1 hostel$/ }).click();
  await page.waitForURL('**/hostels?q=Sunrise');
  await expect(page.getByRole('link', { name: 'Sunrise Residency', exact: true })).toBeVisible();
});

test('S5 (edge): a page past the end shows the real total and a way to the last page', async ({ page }) => {
  const { total } = await publicGet<SearchResult>('/hostels?limit=1');
  await page.goto('/hostels?limit=1&page=99');
  await expect(page.getByRole('heading', { level: 1, name: `${total} hostels in Hyderabad` })).toBeVisible();
  await expect(page.getByText('Nothing on page 99')).toBeVisible();
  await page.getByRole('link', { name: `Go to the last page (${total})` }).click();
  await page.waitForURL(new RegExp(`page=${total}`));
  await expect(page.locator('main article')).toHaveCount(1);
});

test('S6 (edge): odd characters and over-long text never break the search', async ({ page }) => {
  for (const text of ['%', '_', '"\'', '🏠']) {
    await page.goto(`/hostels?q=${encodeURIComponent(text)}`);
    await expect(page.getByText('No hostels match these filters')).toBeVisible();
  }
  // Longer than the API accepts: searched on the first 80 characters instead of failing.
  await page.goto(`/hostels?q=${encodeURIComponent(`Sunrise${' '.repeat(3)}${'x'.repeat(300)}`)}`);
  await expect(page.getByText('We could not run this search')).toHaveCount(0);
  await expect(page.getByText('No hostels match these filters')).toBeVisible();
  expect(await page.getByRole('combobox', { name: 'Search' }).getAttribute('maxlength')).toBe('80');
});

test('S3: a hostel page says what verification covered, why the issue record is hidden, and that few reviews are new', async ({ page }) => {
  // A partner other than the seeded home hostel: one review and no issues yet.
  const h = await hostelNamed('CityNest Madhapur');
  const detail = await publicGet<HostelDetail>(`/hostels/${h.slug}`);
  expect(detail.transparency).toBeNull();
  await page.goto(`/hostels/${h.slug}`);
  await expect(page.getByRole('heading', { name: 'What “Verified partner” means here' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Checked in person' })).toBeVisible();
  await expect(page.getByText('Photos match the rooms, bathrooms and common areas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Not covered' })).toBeVisible();

  await expect(page.getByText(`once residents have reported at least ${TRANSPARENCY_MIN_ISSUES} issues`)).toBeVisible();
  await expect(page.getByText(/That can mean few problems, or few residents using Hostels to report them/)).toBeVisible();

  if (detail.ratings.reviewCount < 3) {
    await expect(page.getByText(`New · ${detail.ratings.reviewCount} review`).first()).toBeVisible();
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}');
    expect(ld.aggregateRating).toBeUndefined();
  }
  // Signed-out readers can see how to report a review.
  await expect(page.getByRole('link', { name: 'Log in to report it' })).toHaveAttribute('href', `/login?next=${encodeURIComponent(`/hostels/${h.slug}#reviews`)}`);
  await noSeriousAxe(page, 'partner page');
});

test('S4: a free listing takes one visit request, never from its own owner; S5: the account shows the next step', async ({ browser, page }) => {
  const free = await hostelNamed('Sri Sai PG');
  // Signed out: no date to lose, just the way in.
  await page.goto(`/hostels/${free.slug}`);
  await expect(page.locator('#visit input[name=preferredDate]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Log in to request a visit' })).toHaveAttribute('href', `/login?next=${encodeURIComponent(`/hostels/${free.slug}#visit`)}`);
  await fits(page, 'free listing');

  const seeker = await newSeeker(browser, SEEKER, `/hostels/${free.slug}`);
  const date = seeker.locator('#visit input[name=preferredDate]');
  const min = await date.getAttribute('min');
  const max = await date.getAttribute('max');
  expect(Math.round((Date.parse(max!) - Date.parse(min!)) / 86_400_000)).toBe(90);
  await seeker.getByRole('button', { name: 'Request visit' }).click();
  await expect(seeker.getByText('Visit requested. The hostel will call you to confirm.')).toBeVisible();
  await expect(seeker.getByText(/^Visit requested for /)).toBeVisible();
  await expect(seeker.getByRole('button', { name: 'Request visit' })).toHaveCount(0);

  await seeker.goto('/account');
  await expect(seeker.getByText('Sent. The hostel will call you to confirm a time.')).toBeVisible();
  await expect(seeker.getByRole('button', { name: 'Withdraw visit request to Sri Sai PG' })).toBeVisible();
  await seeker.context().close();

  // The owner sees their inbox instead of a form.
  const owner = await signIn(browser, FREE_OWNER, { next: `/hostels/${free.slug}` });
  await expect(owner.getByText('This is your hostel. Visitors request visits here')).toBeVisible();
  await expect(owner.locator('#visit input[name=preferredDate]')).toHaveCount(0);
  await owner.context().close();
});

test('S4 + S8: subscribe with the first bill shown, release and re-pick, pay once, and never pay twice', async ({ browser }) => {
  const partner = await hostelNamed('BlueRoof Kondapur');
  const seeker = await newSeeker(browser, SEEKER, `/subscribe/${partner.slug}`);

  // Keyboard: the focused room card shows the solid focus ring, not only the faint "picked" ring.
  const shadow = () => seeker.locator('input[name=roomTypeId]').first().locator('xpath=following-sibling::div[1]').evaluate((el) => getComputedStyle(el).boxShadow);
  await seeker.locator('input[name=roomTypeId]').first().focus();
  await seeker.keyboard.press('ArrowRight');
  await seeker.keyboard.press('ArrowLeft');
  await expect(seeker.locator('input[name=roomTypeId]').first()).toBeFocused();
  expect(await shadow()).toContain('rgb(31, 92, 70)');
  await seeker.getByRole('heading', { level: 1 }).click();
  expect(await shadow()).not.toContain('rgb(31, 92, 70)');

  // The first bill follows the picks.
  const detail = await publicGet<HostelDetail>(`/hostels/${partner.slug}`);
  const room = detail.roomTypes.filter((r) => r.bedsAvailable > 0)[0]!;
  const summary = seeker.locator('dl', { hasText: 'First month' });
  await expect(summary).toContainText(`₹${(room.monthlyRent + 6000).toLocaleString('en-IN')}`);
  await seeker.locator('label', { hasText: 'No food' }).click();
  await expect(summary).toContainText(`₹${room.monthlyRent.toLocaleString('en-IN')}`);
  await expect(seeker.getByText(`We hold the bed for ${PENDING_SUBSCRIPTION_TTL_MINUTES} minutes`)).toBeVisible();
  await noSeriousAxe(seeker, 'subscribe');
  await fits(seeker, 'subscribe');

  await seeker.getByRole('button', { name: 'Continue to payment' }).click();
  await seeker.waitForURL(/\/pay\/inv_/);
  await expect(seeker.getByText(/We’re holding your bed at BlueRoof Kondapur until \d{1,2}:\d{2} [ap]m/)).toBeVisible();
  await noSeriousAxe(seeker, 'pay with a held bed');

  // Changed their mind: release the bed and pick again (not "already subscribed").
  await seeker.getByRole('button', { name: 'Release the bed and choose again' }).click();
  await seeker.waitForURL(new RegExp(`/subscribe/${partner.slug}\\?ok=`));
  await expect(seeker.getByText('The bed is released. Pick a room and food plan again.')).toBeVisible();
  await seeker.getByRole('button', { name: 'Continue to payment' }).click();
  await seeker.waitForURL(/\/pay\/inv_/);
  const payUrl = seeker.url().split('?')[0]!;

  // Coming back to the subscribe page shows the hold, not a second form.
  await seeker.goto(`/subscribe/${partner.slug}`);
  await expect(seeker.getByRole('heading', { name: 'You’re holding a bed at BlueRoof Kondapur' })).toBeVisible();
  await expect(seeker.getByRole('button', { name: 'Continue to payment' })).toHaveCount(0);
  await seeker.getByRole('link', { name: /^Pay ₹/ }).click();
  await seeker.waitForURL(payUrl);

  await seeker.getByRole('button', { name: /simulated/ }).click();
  await expect(seeker.getByText('Payment received. Thank you!')).toBeVisible();
  // S8: back, reload or reopen: the bill reads paid, with no second payment button.
  await seeker.goBack();
  await expect(seeker.getByText(/^Paid on \d/)).toBeVisible();
  await expect(seeker.getByRole('button', { name: /^Pay / })).toHaveCount(0);
  await seeker.goto(payUrl);
  await expect(seeker.getByText(/^Paid on \d/)).toBeVisible();
  await expect(seeker.getByRole('button', { name: /^Pay / })).toHaveCount(0);

  await seeker.goto(`/subscribe/${partner.slug}`);
  await expect(seeker.getByText('You already live at BlueRoof Kondapur')).toBeVisible();
  await seeker.goto('/account');
  await expect(seeker.getByRole('link', { name: 'BlueRoof Kondapur' }).first()).toBeVisible();
  await expect(seeker.getByRole('table')).toContainText('Paid');
  await seeker.context().close();
});

test('S7 (edge): a session that ends before paying sends the seeker to log in and back to the same step', async ({ browser }) => {
  const partner = await hostelNamed('Habitat HiTech');
  const seeker = await newSeeker(browser, LATE_SEEKER, `/subscribe/${partner.slug}`);
  await expect(seeker.getByRole('button', { name: 'Continue to payment' })).toBeVisible();
  // The session ends elsewhere (signed out on another device); this tab still has its cookie.
  await fetch(`${API}/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${await apiToken(LATE_SEEKER)}` } });

  await seeker.getByRole('button', { name: 'Continue to payment' }).click();
  await seeker.waitForURL(/\/login\?/);
  const url = new URL(seeker.url());
  expect(url.searchParams.get('next')).toBe(`/subscribe/${partner.slug}`);
  await expect(seeker.getByText('Your session ended, so please log in again.')).toBeVisible();
  await logInWithCode(seeker, LATE_SEEKER);
  await seeker.waitForURL(`**/subscribe/${partner.slug}`);
  await expect(seeker.getByRole('button', { name: 'Continue to payment' })).toBeVisible();
  await seeker.context().close();
});

test('S8 (edge): a bill cancelled with its released bed reads as nothing to pay', async ({ browser }) => {
  const partner = await hostelNamed('Hive Financial District');
  const seeker = await newSeeker(browser, CHANGED_MIND, `/subscribe/${partner.slug}`);
  await seeker.getByRole('button', { name: 'Continue to payment' }).click();
  await seeker.waitForURL(/\/pay\/inv_/);
  const firstBill = seeker.url().split('?')[0]!;
  await seeker.getByRole('button', { name: 'Release the bed and choose again' }).click();
  await seeker.waitForURL(new RegExp(`/subscribe/${partner.slug}\\?ok=`));

  await seeker.goto(firstBill);
  await expect(seeker.getByText('This bill is no longer due, so there is nothing to pay here.')).toBeVisible();
  await expect(seeker.getByRole('button', { name: /^Pay / })).toHaveCount(0);
  await expect(seeker.getByRole('link', { name: 'See my plan and bills' })).toHaveAttribute('href', '/account');
  await seeker.context().close();
});
