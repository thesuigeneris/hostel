import AxeBuilder from '@axe-core/playwright';
import type { HostelSummary, SearchResult } from '@hostels/shared';
import { expect, type Page, test } from '@playwright/test';
import { publicGet } from './helpers';

// PRP-12 batch 2: search filters, applied chips, pagination, empty states, and the property page.

const phone = { viewport: { width: 390, height: 844 } };

/**
 * Map pins can sit close together when hostels are near each other. WCAG 2.5.8 exempts targets that have an
 * equivalent control elsewhere on the page, and the map view lists every pin as a text link below the map, so
 * target-size findings made up only of map pins are not failures. Every other rule still applies to pins.
 */
const pinsOnly = (v: { id: string; nodes: { target: unknown[] }[] }) =>
  v.id === 'target-size' && v.nodes.every((n) => String(n.target.at(-1)).startsWith('div[title='));

async function noSeriousAxe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = result.violations.filter((v) => (v.impact === 'serious' || v.impact === 'critical') && !pinsOnly(v)).map((v) => `${label}: ${v.id} (${v.nodes[0]?.target}) ${v.nodes[0]?.failureSummary?.replace(/\s+/g, ' ')}`);
  expect(bad).toEqual([]);
}

async function verifiedHostel(): Promise<HostelSummary> {
  const res = await publicGet<SearchResult>('/hostels?verified=true&limit=50');
  const h = res.items.find((x) => x.coverPhotoUrl);
  expect(h, 'the seed has a verified partner with photos').toBeTruthy();
  return h!;
}

test('phone filter sheet: opens as a dialog, Escape returns focus, and applying adds removable chips', async ({ browser }) => {
  const page = await (await browser.newContext(phone)).newPage();
  await page.goto('/hostels');
  const trigger = page.getByRole('button', { name: 'Filters', exact: true });
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeVisible();
  // Focus moved into the sheet, and the page behind is inert.
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await sheet.getByLabel('Sharing').selectOption('2-sharing');
  await sheet.getByLabel('Verified partners only (no advance)').check();
  await sheet.getByRole('button', { name: 'Show results' }).click();
  await page.waitForURL(/sharing=2-sharing/);
  expect(new URL(page.url()).searchParams.get('verified')).toBe('true');
  await expect(page.getByRole('button', { name: 'Filters (2)' })).toBeVisible();

  const chip = page.getByRole('link', { name: 'Remove filter: Verified partners only' });
  await expect(chip).toBeVisible();
  await chip.click();
  await page.waitForURL((u) => !u.searchParams.has('verified'));
  expect(new URL(page.url()).searchParams.get('sharing')).toBe('2-sharing');
});

test('desktop shows the filters inline; clear all resets the search', async ({ page }) => {
  await page.goto('/hostels?food=true&gender=boys');
  await expect(page.getByRole('button', { name: /^Filters/ })).toBeHidden();
  const search = page.getByRole('search', { name: 'Filter hostels' });
  await expect(search.getByLabel('For')).toHaveValue('boys');
  await expect(search.getByLabel('Food available')).toBeChecked();
  await page.getByRole('link', { name: 'Clear all', exact: true }).click();
  await page.waitForURL((u) => u.pathname === '/hostels' && u.search === '');
});

test('no results explains why and offers a way back', async ({ page }) => {
  await page.goto('/hostels?q=zz-no-such-hostel-zz&food=true');
  await expect(page.getByText('No hostels match these filters')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Remove filter: “zz-no-such-hostel-zz”' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Clear all filters' }).click();
  await page.waitForURL((u) => u.pathname === '/hostels' && u.search === '');
  await expect(page.locator('main article').first()).toBeVisible();

  await page.goto('/hostels?minRent=9000&maxRent=4000');
  await expect(page.getByText('“Rent from” is higher than “Rent up to”.')).toBeVisible();
});

test('pagination is windowed, marks the current page, and recovers past the end', async ({ page }) => {
  const total = (await publicGet<SearchResult>('/hostels?limit=1')).total;
  test.skip(total < 3, 'needs at least three live hostels');
  await page.goto('/hostels?limit=1');
  const pages = page.getByRole('navigation', { name: 'Pages' });
  await expect(pages.getByRole('link', { name: '1', exact: true })).toHaveAttribute('aria-current', 'page');
  // The page's own count can lag the API by its cache window, so only the shape is checked.
  await expect(page.getByText(/^Showing 1–1 of \d+$/)).toBeVisible();
  await pages.getByRole('link', { name: 'Next' }).click();
  await page.waitForURL(/page=2/);
  await expect(page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');

  await page.goto('/hostels?limit=1&page=99');
  await expect(page.getByText('Nothing on page 99')).toBeVisible();
  await page.getByRole('link', { name: 'Go to page 1' }).click();
  await page.waitForURL((u) => !u.searchParams.has('page'));
});

test('cards are named by the hostel, and the map view has a text list', async ({ page }) => {
  const h = await verifiedHostel();
  await page.goto(`/hostels?q=${encodeURIComponent(h.name)}`);
  await expect(page.getByRole('link', { name: h.name, exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Results view' }).getByRole('link', { name: 'Map' }).click();
  await page.waitForURL(/view=map/);
  await expect(page.getByRole('heading', { name: 'Hostels on this map' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Results view' }).getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator(`.leaflet-marker-icon[title="${h.name}"]`)).toBeVisible();
});

test('property page: price breakdown, bed freshness, verification scope', async ({ page }) => {
  const h = await verifiedHostel();
  await page.goto(`/hostels/${h.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: h.name })).toBeVisible();
  const aside = page.getByRole('complementary', { name: 'Price and contact' });
  await expect(aside.getByText('Example monthly bill')).toBeVisible();
  await expect(aside.getByText('Total per month')).toBeVisible();
  await expect(page.getByText(/^(Updated .+ ago|Update time not recorded|Updated just now)$/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What “Verified partner” means here' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Not covered' })).toBeVisible();
});

test('gallery: lightbox works with the keyboard and returns focus; failed photos show a placeholder', async ({ page }) => {
  const h = await verifiedHostel();
  const detail = await publicGet<{ photos: unknown[] }>(`/hostels/${h.slug}`);
  // Photo hosts may be unreachable; abort them all so the fallback is exercised the same way everywhere.
  await page.route(/\.(jpe?g|png|webp)(\?.*)?$|images\.unsplash\.com/, (r) => r.abort());
  await page.goto(`/hostels/${h.slug}`);
  await expect(page.locator(`[role="img"][aria-label="${h.name}, photo 1 of ${detail.photos.length}"]`).last()).toBeVisible();
  test.skip(detail.photos.length < 2, 'needs a hostel with two or more photos');

  const open = page.getByRole('button', { name: `All ${detail.photos.length} photos` });
  await open.click();
  const box = page.getByRole('dialog', { name: 'Photos' });
  await expect(box).toBeVisible();
  await expect(box.getByText(`Photo 1 of ${detail.photos.length}`)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(box.getByText(`Photo 2 of ${detail.photos.length}`)).toBeVisible();
  await box.getByRole('button', { name: 'Previous photo' }).click();
  await expect(box.getByText(`Photo 1 of ${detail.photos.length}`)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();
  await expect(open).toBeFocused();
});

test('phones keep the main action in a sticky bar that never covers the footer', async ({ browser }) => {
  const h = await verifiedHostel();
  const page = await (await browser.newContext(phone)).newPage();
  await page.goto(`/hostels/${h.slug}`);
  const bar = page.locator('[data-sticky-actions]');
  await expect(bar.getByRole('link', { name: 'Subscribe' })).toBeVisible();
  // At the top of the page the bar sits on the bottom edge of the screen.
  const atTop = await bar.boundingBox();
  expect(Math.round(atTop!.y + atTop!.height)).toBe(844);
  // At the very bottom it has stopped above the footer instead of covering it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const overlap = await page.evaluate(() => {
    const b = document.querySelector('[data-sticky-actions]')!.getBoundingClientRect();
    const f = document.querySelector('footer')!.getBoundingClientRect();
    return b.bottom - f.top;
  });
  expect(overlap).toBeLessThanOrEqual(1);
  const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(vw + 1);
});

test('no serious or critical accessibility violations on property, area and map pages', async ({ page }) => {
  const h = await verifiedHostel();
  const areas = await publicGet<{ slug: string }[]>('/areas');
  for (const path of [`/hostels/${h.slug}`, `/hostels-in/${areas[0]!.slug}`, '/hostels?view=map', '/hostels?q=zz-none']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await noSeriousAxe(page, path);
  }
});
