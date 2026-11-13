import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// PRP-12 batch 1: homepage, 3D hero fallbacks, motion policy, navigation and accessibility.

/** Makes WebGL unavailable, as on old devices or with hardware acceleration off. */
async function disableWebgl(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // biome-ignore lint/suspicious/noExplicitAny: test shim around a DOM overload
    (HTMLCanvasElement.prototype as any).getContext = function (type: string, ...args: unknown[]) {
      return /webgl/.test(type) ? null : original.apply(this, [type, ...args] as never);
    };
  });
}

async function noHorizontalOverflow(page: Page) {
  const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
  expect(sw, 'page is wider than the viewport').toBeLessThanOrEqual(vw + 1);
}

test('search works without the 3D scene, and the static illustration shows', async ({ page }) => {
  await disableWebgl(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('figure[data-hero-mode="static"]')).toBeVisible();
  await expect(page.getByText('Illustration, not a real property.')).toBeVisible();

  const search = page.getByRole('search', { name: 'Find a hostel' });
  await search.getByLabel('Area').selectOption('Gachibowli');
  await search.getByLabel('Only verified partners (no advance)').check();
  await search.getByRole('button', { name: 'Search' }).click();
  await page.waitForURL(/\/hostels\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get('area')).toBe('Gachibowli');
  expect(url.searchParams.get('verified')).toBe('true');
  expect(errors).toEqual([]);
});

test('3D hero renders with WebGL, and draws one still frame with reduced motion', async ({ browser }) => {
  const moving = await (await browser.newContext()).newPage();
  await moving.goto('/');
  await expect(moving.locator('figure[data-hero-mode="3d"]')).toBeVisible();
  const canvas = moving.locator('figure canvas');
  await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  const first = Number(await canvas.getAttribute('data-frames'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(first);

  const still = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  await still.goto('/');
  await expect(still.locator('figure[data-hero-mode="3d"]')).toBeVisible();
  await still.waitForTimeout(800);
  await expect(still.locator('figure canvas')).toHaveAttribute('data-frames', '1');
});

test('a lost WebGL context that is not restored falls back to the illustration', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('figure[data-hero-mode="3d"]')).toBeVisible();
  await page.evaluate(() => {
    const canvas = document.querySelector('figure canvas') as HTMLCanvasElement;
    (canvas.getContext('webgl2') ?? canvas.getContext('webgl'))?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.locator('figure[data-hero-mode="static"]')).toBeVisible({ timeout: 6000 });
  await expect(page.getByRole('search', { name: 'Find a hostel' }).getByRole('button', { name: 'Search' })).toBeEnabled();
});

test('three.js is only downloaded by the homepage', async ({ page }) => {
  const bodies: Promise<string>[] = [];
  page.on('response', (r) => {
    if (r.url().endsWith('.js')) bodies.push(r.text().catch(() => ''));
  });
  for (const path of ['/hostels', '/login', '/for-owners']) await page.goto(path, { waitUntil: 'networkidle' });
  const texts = await Promise.all(bodies);
  expect(texts.some((t) => t.includes('WebGLRenderer'))).toBe(false);
});

test('skip link and visible keyboard focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
  // The next Tab lands inside the page content, not back in the header.
  await page.keyboard.press('Tab');
  const inMain = await page.evaluate(() => !!document.activeElement?.closest('main'));
  expect(inMain).toBe(true);
});

test('mobile menu opens with the keyboard and navigates', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto('/');
  await noHorizontalOverflow(page);
  const menu = page.locator('summary', { hasText: 'Menu' });
  await menu.focus();
  await page.keyboard.press('Enter');
  const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Find a hostel' });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL('**/hostels');
  await expect(page.getByRole('link', { name: 'Find a hostel' }).first()).toHaveAttribute('aria-current', 'page');
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`no horizontal overflow on public pages at ${width}px`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    for (const path of ['/', '/hostels', '/login', '/for-owners']) {
      await page.goto(path);
      await noHorizontalOverflow(page);
    }
  });
}

test('no serious or critical accessibility violations on the homepage, search and login', async ({ page }) => {
  for (const path of ['/', '/hostels', '/login']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path}: ${v.id}`);
    expect(bad).toEqual([]);
  }
});
