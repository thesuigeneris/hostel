import { expect, test } from '@playwright/test';
import { apiPost } from './a11y';
import { ADMIN, DEMO_OWNER, DEMO_TENANT, apiGet, apiToken, publicGet, signIn } from './helpers';

/**
 * Owner and admin tools added with the partner standards work:
 * the owner dashboard, brand standards on the Plan page and the brand kit; admin owner plans,
 * bill filters and waiving, listing search, and the audit log of admin actions.
 */

test.describe.configure({ mode: 'serial' });

type OwnedHostel = { id: string; name: string; slug: string; status: string; partnerStatus: string };

test('owner sees the dashboard, the brand standards and a printable brand kit', async ({ browser }) => {
  const hostels = await apiGet<OwnedHostel[]>(DEMO_OWNER, '/owner/hostels');
  const partner = hostels.find((h) => h.partnerStatus === 'verified');
  expect(partner, 'the demo owner has a verified partner hostel').toBeTruthy();
  const base = `/owner/hostels/${partner!.id}`;
  const owner = await signIn(browser, DEMO_OWNER, { next: `${base}/dashboard` });

  await expect(owner.getByRole('heading', { name: /Occupancy and money/ })).toBeVisible();
  await expect(owner.getByRole('heading', { name: 'Demand, last 30 days' })).toBeVisible();
  await expect(owner.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
  await expect(owner.getByText('Median first reply')).toBeVisible();
  await expect(owner.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');

  await owner.goto(`${base}/plan`);
  await expect(owner.getByRole('heading', { name: 'Partner brand standards' })).toBeVisible();
  await expect(owner.getByText(/Verified/).first()).toBeVisible();
  await expect(owner.getByText('Photos match the rooms, bathrooms and common areas')).toBeVisible();

  await owner.goto(`${base}/brand`);
  await expect(owner.getByRole('heading', { name: 'Show tenants you are a verified Hostels partner' })).toBeVisible();
  const download = owner.getByRole('link', { name: /Download SVG of the signboard/i });
  await expect(download).toBeVisible();
  const svg = await owner.request.get(`${base}/brand/signboard.svg?download=1`);
  expect(svg.status()).toBe(200);
  expect(svg.headers()['content-type']).toContain('image/svg+xml');
  expect(svg.headers()['content-disposition']).toContain('attachment');
  expect(await svg.text()).toContain(partner!.name.replace(/&/g, '&amp;'));

  // A free listing has no brand kit: the tab shows the upgrade instead of files.
  const other = hostels.find((h) => h.partnerStatus !== 'verified');
  if (other) {
    expect((await owner.request.get(`/owner/hostels/${other.id}/brand/signboard.svg`)).status()).toBe(403);
  }
  await owner.context().close();
});

test('admin filters owner bills, waives one, and the audit log records it', async ({ browser }) => {
  const hostels = await apiGet<OwnedHostel[]>(DEMO_OWNER, '/owner/hostels');
  const partner = hostels.find((h) => h.partnerStatus === 'verified')!;
  const admin = await signIn(browser, ADMIN, { next: '/admin' });
  // The billing job issues this period's plan bills (the seeded trial ended last month).
  await admin.getByRole('button', { name: 'Run jobs now' }).click();
  await expect(admin.getByText(/Jobs ran/)).toBeVisible();

  await admin.goto(`/admin/billing?bills=due&q=${encodeURIComponent(partner.name)}`);
  await expect(admin.getByRole('link', { name: 'Unpaid' })).toHaveAttribute('aria-current', 'page');
  const row = admin.getByRole('row', { name: new RegExp(partner.name) }).filter({ has: admin.getByRole('button', { name: 'Waive' }) }).first();
  await expect(row).toBeVisible();
  admin.once('dialog', (d) => d.accept());
  await row.getByRole('textbox').fill('Goodwill month after the kitchen repair');
  await row.getByRole('button', { name: 'Waive' }).click();
  await expect(admin.getByText('Bill waived')).toBeVisible();

  await admin.goto('/admin/billing?bills=waived');
  await expect(admin.getByRole('link', { name: 'Waived' })).toHaveAttribute('aria-current', 'page');
  // The owner plans table lists the hostel too; the bills table row is the one with the waived bill.
  await expect(admin.getByRole('row', { name: new RegExp(partner.name) }).filter({ hasText: 'Waived' }).first()).toBeVisible();

  await admin.goto('/admin/audit?action=owner_invoice.void');
  await expect(admin.getByText(/Goodwill month after the kitchen repair/)).toBeVisible();
  await admin.goto('/admin/audit');
  await expect(admin.getByRole('cell', { name: 'Jobs Run' }).first()).toBeVisible();

  // Listing search narrows the table to matching hostels.
  await admin.goto(`/admin/listings?status=live&q=${encodeURIComponent(partner.name)}`);
  await expect(admin.getByRole('heading', { name: partner.name }).or(admin.getByText(partner.name).first())).toBeVisible();
  await admin.goto('/admin/listings?status=live&q=zzzz-no-such-hostel');
  await expect(admin.getByText(/No live listings match/)).toBeVisible();
  await admin.context().close();
});

test('admin tables page with Previous and Next, keeping filters', async ({ browser }) => {
  const admin = await signIn(browser, ADMIN, { next: '/admin/listings?status=live&page=2' });
  const pages = admin.getByRole('navigation', { name: 'Listing pages' });
  await expect(pages.getByText('Page 2')).toBeVisible();
  await expect(pages.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/admin/listings?status=live&page=1');

  await admin.goto('/admin/billing?bills=paid&subs=2');
  const subs = admin.getByRole('navigation', { name: 'Subscription pages' });
  await expect(subs.getByText('Page 2')).toBeVisible();
  await expect(subs.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/admin/billing?bills=paid&subs=1#subs');
  await admin.context().close();
});

test('moderation: keep with the keyboard only, then hide with a rule and show again; the public page follows each', async ({ browser }) => {
  // A reader flags a seeded review.
  const cards = (await publicGet<{ items: { slug: string }[] }>('/hostels?limit=50')).items;
  let reviewId = '';
  let slug = '';
  for (const c of cards) {
    const reviews = await publicGet<{ id: string }[]>(`/hostels/${c.slug}/reviews`);
    if (reviews.length) {
      reviewId = reviews[0]!.id;
      slug = c.slug;
      break;
    }
  }
  expect(reviewId).not.toBe('');
  await apiPost(await apiToken(DEMO_TENANT), `/reviews/${reviewId}/flag`, { reason: 'Mentions a staff member by full name' });

  const admin = await signIn(browser, ADMIN, { next: '/admin/moderation' });
  const card = admin.locator('div.rounded-2xl', { hasText: 'Mentions a staff member by full name' }).first();
  await expect(card).toBeVisible();
  await card.getByLabel('Note').focus();
  await admin.keyboard.type('Names a staff member, but kindly; fine to keep');
  await admin.keyboard.press('Tab'); // to "Hide review"
  await admin.keyboard.press('Tab'); // to "Keep it"
  await expect(card.getByRole('button', { name: 'Keep it' })).toBeFocused();
  await admin.keyboard.press('Enter');
  await expect(admin.getByText('Review kept; its flags are dismissed')).toBeVisible();
  // Kept means still public (the button's value was once lost and the review was hidden instead).
  const publicIds = async () => (await publicGet<{ id: string }[]>(`/hostels/${slug}/reviews`)).map((r) => r.id);
  expect(await publicIds()).toContain(reviewId);

  // Flagged again (allowed once an admin has acted), then hidden with a rule.
  await apiPost(await apiToken(DEMO_TENANT), `/reviews/${reviewId}/flag`, { reason: 'Shares a phone number in the text' });
  await admin.reload();
  const again = admin.locator('div.rounded-2xl', { hasText: 'Shares a phone number in the text' }).first();
  await again.getByLabel('Rule it breaks').selectOption({ index: 1 });
  await again.getByRole('button', { name: 'Hide review' }).click();
  await expect(admin.getByText('Review hidden', { exact: true })).toBeVisible();
  expect(await publicIds()).not.toContain(reviewId);

  await admin.getByRole('button', { name: /^Show the review by .* again$/ }).first().click();
  await expect(admin.getByText('Review is visible again')).toBeVisible();
  expect(await publicIds()).toContain(reviewId);
  await admin.context().close();
});
