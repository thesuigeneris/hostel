import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { ADMIN, apiGet, DEMO_OWNER, DEMO_TENANT, signIn } from './helpers';

// PRP-12 batch 4: every signed-in workspace page, at every width, for each role, plus role-aware navigation.

const WIDTHS = [360, 390, 768, 1024, 1440];

/** Visits each path and returns problems: page errors, horizontal overflow at any width, serious axe findings. */
async function sweep(page: Page, paths: string[]) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`${page.url()}: page error ${e.message}`));
  for (const path of paths) {
    await page.setViewportSize({ width: 1280, height: 900 });
    const res = await page.goto(path, { waitUntil: 'networkidle' });
    if (!res || res.status() >= 400) problems.push(`${path}: HTTP ${res?.status()}`);
    if (new URL(page.url()).pathname.startsWith('/login')) problems.push(`${path}: sent to login`);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    for (const v of axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
      problems.push(`${path}: ${v.id} ${v.nodes[0]?.target} ${v.nodes[0]?.failureSummary?.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
      if (sw > vw + 1) problems.push(`${path}: ${sw - vw}px overflow at ${width}`);
    }
  }
  return problems;
}

test('resident workspace: accessible and fits every width', async ({ browser }) => {
  const page = await signIn(browser, DEMO_TENANT);
  const stays = await apiGet<{ hostel: { id: string } }[]>(DEMO_TENANT, '/me/residencies');
  const paths = ['/account', '/stay', ...stays.slice(0, 1).map((s) => `/stay/${s.hostel.id}`), ...stays.slice(0, 1).map((s) => `/stay/${s.hostel.id}?tab=issues`)];
  expect(await sweep(page, paths)).toEqual([]);
});

test('owner workspace: accessible and fits every width', async ({ browser }) => {
  const page = await signIn(browser, DEMO_OWNER);
  const hostels = await apiGet<{ id: string }[]>(DEMO_OWNER, '/owner/hostels');
  const id = hostels[0]!.id;
  const tabs = ['', '/rooms', '/residents', '/rent', '/community', '/reviews', '/menu', '/kitchen', '/plan'].map((t) => `/owner/hostels/${id}${t}`);
  expect(await sweep(page, ['/owner', '/owner/visits', '/owner/issues', '/owner/payouts', '/owner/hostels/new', ...tabs])).toEqual([]);
});

test('admin workspace: accessible and fits every width', async ({ browser }) => {
  const page = await signIn(browser, ADMIN);
  const paths = ['/admin', '/admin/listings', '/admin/partners', '/admin/billing', '/admin/payouts', '/admin/issues', '/admin/moderation', '/admin/food'];
  expect(await sweep(page, paths)).toEqual([]);
});

test('navigation matches the role, and hidden links are not the only guard', async ({ browser }) => {
  const tenant = await signIn(browser, DEMO_TENANT, { next: '/account' });
  const nav = tenant.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'My plan' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Owner dashboard' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  // Typing the URL does not get a tenant in: the server sends them to log in as the right role.
  await tenant.goto('/admin');
  await expect(tenant).toHaveURL(/\/login\?next=%2Fadmin/);
  await tenant.goto('/owner');
  await expect(tenant).toHaveURL(/\/login\?next=%2Fowner/);

  const owner = await signIn(browser, DEMO_OWNER, { next: '/owner' });
  await expect(owner.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Owner dashboard' })).toBeVisible();
  await expect(owner.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await owner.goto('/admin');
  await expect(owner).toHaveURL(/\/login\?next=%2Fadmin/);

  const admin = await signIn(browser, ADMIN, { next: '/admin' });
  await expect(admin.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admin' })).toBeVisible();
});
