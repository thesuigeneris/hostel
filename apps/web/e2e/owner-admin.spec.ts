import { expect, test } from '@playwright/test';
import { ADMIN, DEMO_OWNER, apiGet, signIn } from './helpers';

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
