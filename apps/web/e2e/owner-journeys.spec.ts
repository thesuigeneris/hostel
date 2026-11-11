import { PARTNER_STANDARD_IDS } from '@hostels/shared';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { ADMIN, API, apiGet, apiToken, DEMO_OWNER, signIn } from './helpers';

/**
 * Owner persona journeys the other specs don't cover end to end (acceptance O1–O8 and edge cases I1, M8, O6, S4,
 * T10): the Issues badge and what answers an issue, a next step for every listing state, the upgrade credit on
 * the first Partner bill, the roster's move-out dates and the rent still due, editing a review reply, the visit
 * inbox's one-way states, a brand kit for a long Devanagari name, the plan rules on /for-owners and copying a menu.
 */

test.describe.configure({ mode: 'serial' });

const run = Date.now().toString().slice(-7);
const NEW_OWNER = `973${run}`;
const SEEKER = `974${run}`;
const PADMA = '9000000005'; // seeded owner of a Pro listing whose free month is over, and a Free one
const RAVI = '9000000004'; // seeded owner of Sri Sai PG (Pro, with owner-added residents and a rent sheet)

type Owned = { id: string; name: string; slug: string; status: string; partnerStatus: string };
type Detail = Owned & { plan: { plan: string; effective: string; suspended: boolean } };

async function call<T = unknown>(phone: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: { authorization: `Bearer ${await apiToken(phone)}`, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Horizontal overflow at phone widths (screen-reader text inside a scroller used to widen the page). */
async function overflowAtPhoneWidths(page: Page) {
  const out: string[] = [];
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    if (sw > vw + 1) out.push(`${sw - vw}px at ${width}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  return out;
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes[0]?.target}`);
}

test('I1: an issue waiting over a day is counted on the Issues tab, and a comment alone answers it', async ({ browser }) => {
  const issues = await apiGet<{ id: string; hostelId: string; title: string; status: string; needsResponse: boolean }[]>(DEMO_OWNER, '/owner/issues');
  const fan = issues.find((i) => i.title === 'Fan regulator broken in room 204')!;
  expect(fan).toMatchObject({ status: 'open', needsResponse: true });

  const owner = await signIn(browser, DEMO_OWNER, { next: '/owner' });
  await expect(owner.getByRole('link', { name: /All issues.*waiting for your reply/ })).toBeVisible();
  await owner.goto(`/owner/hostels/${fan.hostelId}/dashboard`);
  const tab = owner.getByRole('navigation', { name: 'Hostel sections' }).getByRole('link', { name: /Issues & community/ });
  await expect(tab).toHaveAccessibleName(/1 issue waiting for your reply/);

  // Answer with a comment only: the issue stays open, but it no longer waits on the hostel.
  await owner.goto(`/issues/${fan.id}`);
  await owner.locator('textarea[name=message]').fill(`An electrician is coming tomorrow morning (${run}).`);
  await owner.getByRole('button', { name: 'Comment' }).click();
  await expect(owner.getByText(`An electrician is coming tomorrow morning (${run}).`)).toBeVisible();
  await owner.goto(`/owner/hostels/${fan.hostelId}/dashboard`);
  await expect(owner.getByRole('navigation', { name: 'Hostel sections' }).getByRole('link', { name: 'Issues & community', exact: true })).toBeVisible();
  const after = await apiGet<{ id: string; status: string; needsResponse: boolean }[]>(DEMO_OWNER, '/owner/issues');
  expect(after.find((i) => i.id === fan.id)).toMatchObject({ status: 'open', needsResponse: false });
  await owner.context().close();
});

test('O2 and O6: every listing state on the owner home has a next step, from no hostels to a rejection', async ({ browser }) => {
  const owner = await signIn(browser, NEW_OWNER, { owner: true, name: 'Kavya', next: '/owner' });
  await expect(owner.getByText('List your first hostel')).toBeVisible();
  await expect(owner.locator('#main').getByRole('link', { name: 'List your hostel free' })).toBeVisible();
  expect(await axe(owner)).toEqual([]);

  const hostel = await call<{ id: string }>(NEW_OWNER, '/owner/hostels', {
    body: { name: `Next Step House ${run}`, area: 'Madhapur', lat: 17.45, lng: 78.39, genderType: 'girls', contactPhone: NEW_OWNER },
  });
  await owner.reload();
  await expect(owner.getByText('Draft. Add your rooms and rent next.')).toBeVisible();
  await owner.getByRole('link', { name: 'Add rooms' }).click();
  await expect(owner).toHaveURL(new RegExp(`/owner/hostels/${hostel.id}/rooms`));
  // A Free hostel's locked tabs carry screen-reader text inside the scrolling tab bar.
  expect(await overflowAtPhoneWidths(owner)).toEqual([]);

  await call(NEW_OWNER, `/owner/hostels/${hostel.id}/rooms`, { body: { sharing: '2-sharing', monthlyRent: 8000, advanceAmount: 0, totalBeds: 6, bedsAvailable: 2 } });
  await owner.goto('/owner');
  await expect(owner.getByText('Draft. Add at least one photo next.')).toBeVisible();

  const form = new FormData();
  form.append('file', new Blob([readFileSync('e2e/fixtures/room.png')], { type: 'image/png' }), 'room.png');
  form.append('purpose', 'listing');
  const up = await fetch(`${API}/uploads`, { method: 'POST', body: form, headers: { authorization: `Bearer ${await apiToken(NEW_OWNER)}` } });
  const { upload } = (await up.json()) as { upload: string };
  await call(NEW_OWNER, `/owner/hostels/${hostel.id}/photos`, { body: { photo: upload } });
  await owner.goto('/owner');
  await expect(owner.getByText(/Draft, ready to go/)).toBeVisible();
  await call(NEW_OWNER, `/owner/hostels/${hostel.id}/submit`, { method: 'POST' });
  await owner.goto('/owner');
  await expect(owner.getByText(/In review\. We usually approve within a day/)).toBeVisible();

  // The team sends it back with a reason the owner can act on.
  await call(ADMIN, `/admin/hostels/${hostel.id}/reject`, { body: { reason: 'Add a photo of the bathroom' } });
  await owner.goto('/owner');
  await expect(owner.getByText('Not approved: Add a photo of the bathroom. Fix the listing and send it again.')).toBeVisible();
  await owner.getByRole('link', { name: 'Fix the listing' }).click();
  await expect(owner.getByText('Our team said: Add a photo of the bathroom.', { exact: false })).toBeVisible();
  expect(await axe(owner)).toEqual([]);
  await owner.context().close();
});

test('M8: upgrading Pro to Partner on a paid month credits the unused Pro days on the first Partner bill', async ({ browser }) => {
  const hostels = await apiGet<Owned[]>(PADMA, '/owner/hostels');
  const details = await Promise.all(hostels.map((h) => apiGet<Detail>(PADMA, `/owner/hostels/${h.id}`)));
  const pro = details.find((h) => h.plan.plan === 'pro' && h.status === 'live')!;
  expect(pro, 'a seeded Pro hostel whose free month is over').toBeTruthy();

  // This month's Pro bill is issued by the billing job and paid.
  await call(ADMIN, '/admin/jobs/run', { method: 'POST' });
  type Bill = { id: string; plan: string; status: string; amount: number; creditAmount: number; note: string | null; periodStart: string };
  const before = (await apiGet<{ bills: Bill[] }>(PADMA, `/owner/hostels/${pro.id}/plan`)).bills;
  const proBill = before.find((b) => b.plan === 'pro' && b.status === 'due')!;
  expect(proBill).toBeTruthy();
  await call(PADMA, `/payments/${proBill.id}/simulate`, { method: 'POST' });

  const owner = await signIn(browser, PADMA, { next: `/owner/hostels/${pro.id}/plan` });
  await owner.getByRole('button', { name: 'Apply to become a partner' }).click();
  await expect(owner.getByText('Partner application sent.', { exact: false })).toBeVisible();
  // Verifying needs every brand standard ticked (standards that don't apply are ignored).
  await call(ADMIN, `/admin/hostels/${pro.id}/partner/verify`, { body: { platformFeePct: 10, checklist: PARTNER_STANDARD_IDS } });

  await owner.goto(`/owner/hostels/${pro.id}/plan`);
  const bills = (await apiGet<{ bills: Bill[] }>(PADMA, `/owner/hostels/${pro.id}/plan`)).bills;
  const partner = bills.find((b) => b.plan === 'partner' && b.status === 'due')!;
  // The upgrade lands on the first day of the paid Pro month, so all of it is unused.
  expect(partner).toMatchObject({ periodStart: proBill.periodStart, amount: 1000, creditAmount: 999 });
  const row = owner.getByRole('row').filter({ hasText: 'Credit for unused Pro days' });
  await expect(row).toContainText('₹1,000');
  await expect(row).toContainText('₹1,999 − ₹999 credit');
  await expect(owner.getByText('Plan bill ready')).toBeVisible();
  await expect(owner.getByRole('heading', { name: 'How billing works' })).toBeVisible();
  // The due bill's Pay link sits in the scrolling bills table.
  await expect(owner.getByRole('link', { name: /^Pay ₹1,000 for / })).toBeVisible();
  expect(await overflowAtPhoneWidths(owner)).toEqual([]);
  expect(await axe(owner)).toEqual([]);
  await owner.context().close();
});

test('O4 and T10: a move-out date ahead reads "Leaving on", and the rent tracker shows what is still due in rupees', async ({ browser }) => {
  const hostels = await apiGet<Owned[]>(RAVI, '/owner/hostels');
  const sriSai = hostels.find((h) => h.name === 'Sri Sai PG')!;
  const base = `/owner/hostels/${sriSai.id}`;
  const owner = await signIn(browser, RAVI, { next: `${base}/residents` });
  const phone = `975${run}`;
  await owner.getByLabel('Phone').fill(phone);
  await owner.getByLabel(/^Name/).fill('Ravi Teja');
  await owner.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(owner.getByText('Resident added.', { exact: false })).toBeVisible();

  // An owner-added resident from the seed moves out next week: still living here until then.
  const roster = await apiGet<{ id: string; name: string; status: string; source: string }[]>(RAVI, `${base}/residents`);
  const leaving = roster.find((r) => r.status === 'active' && r.source === 'owner')!;
  const inAWeek = new Date(Date.now() + 7 * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const rowFor = owner.getByRole('row').filter({ hasText: leaving.name });
  await rowFor.getByLabel(/Move-out date for/).fill(inAWeek);
  await rowFor.getByRole('button', { name: 'Set move-out' }).click();
  await expect(owner.getByText(/^Leaving on .* They keep access until then\.$/)).toBeVisible();
  await expect(owner.getByRole('row').filter({ hasText: leaving.name })).toContainText('Leaving on');

  const sheet = await apiGet<{ totals: { due: number; collected: number; unpaid: number } }>(RAVI, `${base}/rent`);
  await owner.goto(`${base}/rent`);
  const unpaid = Math.max(0, sheet.totals.due - sheet.totals.collected);
  const stillUnpaid = owner.locator('div.rounded-2xl', { hasText: 'Still unpaid' }).last();
  await expect(stillUnpaid).toContainText(`₹${unpaid.toLocaleString('en-IN')}`);
  expect(await axe(owner)).toEqual([]);
  await owner.context().close();
});

test('O2 (reviews): an owner edits a reply, and the public card says it was edited', async ({ browser }) => {
  const hostels = await apiGet<Owned[]>(DEMO_OWNER, '/owner/hostels');
  type R = { id: string; ownerReply: string | null; ownerReplyEditedAt: string | null };
  let target: { hostel: Owned; review: R } | null = null;
  for (const h of hostels) {
    const r = (await apiGet<R[]>(DEMO_OWNER, `/owner/hostels/${h.id}/reviews`)).find((x) => x.ownerReply && !x.ownerReplyEditedAt);
    if (r) {
      target = { hostel: h, review: r };
      break;
    }
  }
  expect(target, 'a seeded review with a reply').toBeTruthy();
  const { hostel, review } = target!;
  const owner = await signIn(browser, DEMO_OWNER, { next: `/owner/hostels/${hostel.id}/reviews` });
  const card = owner.locator('div.rounded-2xl', { hasText: review.ownerReply! }).last();
  await card.getByText('Edit reply').click();
  const edited = `Thank you! We fixed the water heater too (${run}).`;
  await card.getByRole('textbox', { name: /Edit your reply/ }).fill(edited);
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(owner.getByText('Reply updated. It now shows as edited.')).toBeVisible();
  await owner.context().close();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/hostels/${hostel.slug}`);
  const pub = visitor.locator('div.rounded-2xl', { hasText: edited });
  await expect(pub.getByText(/Reply from the hostel/)).toContainText('edited');
  await visitor.context().close();
});

test('S4: the visit inbox only moves forward, and a closed request has nothing left to press', async ({ browser }) => {
  const hostels = await apiGet<Owned[]>(PADMA, '/owner/hostels');
  const live = hostels.find((h) => h.status === 'live' && h.partnerStatus === 'none')!;
  const visitDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const visit = await call<{ id: string }>(SEEKER, `/hostels/${live.id}/visits`, { body: { preferredDate: visitDate, message: `Evening visit ${run}` } });

  const owner = await signIn(browser, PADMA, { next: '/owner/visits?status=new' });
  const card = owner.locator('div.rounded-2xl', { hasText: `Evening visit ${run}` });
  await expect(card.getByRole('button', { name: 'Mark new' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Mark contacted' }).click();
  await expect(owner.getByText('Marked as contacted')).toBeVisible();
  await owner.goto('/owner/visits?status=contacted');
  const contacted = owner.locator('div.rounded-2xl', { hasText: `Evening visit ${run}` });
  await expect(contacted.getByRole('button', { name: 'Mark contacted' })).toHaveCount(0);
  await contacted.getByRole('button', { name: 'Close' }).click();
  await expect(owner.getByText('Request closed')).toBeVisible();
  await owner.goto('/owner/visits?status=closed');
  const closed = owner.locator('div.rounded-2xl', { hasText: `Evening visit ${run}` });
  await expect(closed).toContainText('Closed');
  await expect(closed.getByRole('button')).toHaveCount(0);
  // The API agrees: closed is final.
  const reopen = await fetch(`${API}/owner/visits/${visit.id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${await apiToken(PADMA)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'contacted' }),
  });
  expect(reopen.status).toBe(409);
  expect(await axe(owner)).toEqual([]);
  await owner.context().close();
});

test('O7: the brand kit draws a long Devanagari name whole, on two lines, with fonts that have the script', async ({ browser }) => {
  const hostels = await apiGet<Owned[]>(DEMO_OWNER, '/owner/hostels');
  const partner = hostels.find((h) => h.partnerStatus === 'verified')!;
  const longName = 'श्री वेंकटेश्वर कम्फर्ट्स बॉयज़ एंड वर्किंग प्रोफेशनल्स हॉस्टल';
  await call(DEMO_OWNER, `/owner/hostels/${partner.id}`, { method: 'PATCH', body: { name: longName } });
  try {
    const owner = await signIn(browser, DEMO_OWNER, { next: `/owner/hostels/${partner.id}/brand` });
    await expect(owner.getByRole('heading', { name: 'Show tenants you are a verified Hostels partner' })).toBeVisible();
    const svg = await (await owner.request.get(`/owner/hostels/${partner.id}/brand/signboard.svg?download=1`)).text();
    const tspans = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    expect(tspans.length).toBe(2);
    expect(tspans.join(' ')).toBe(longName);
    expect(svg).toContain('xml:lang="hi"');
    expect(svg).toContain('Noto Sans Devanagari');
    const res = await owner.request.get(`/owner/hostels/${partner.id}/brand/poster.svg?download=1`);
    expect(res.headers()['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent(longName.split(' ')[0]!)}`);
    expect(await axe(owner)).toEqual([]);
    await owner.context().close();
  } finally {
    await call(DEMO_OWNER, `/owner/hostels/${partner.id}`, { method: 'PATCH', body: { name: partner.name } });
  }
});

test('O1: /for-owners explains prices, the free month, the pause rule and what Verified partner requires', async ({ page }) => {
  await page.goto('/for-owners');
  await expect(page.getByRole('heading', { name: 'How billing works' })).toBeVisible();
  await expect(page.getByText(/free for the first month, once per hostel/)).toBeVisible();
  await expect(page.getByText(/At 15 days overdue the hostel drops to the Free features/)).toBeVisible();
  await expect(page.getByText(/You never pay twice for the same days/)).toBeVisible();
  const verified = page.getByRole('region', { name: 'What “Verified partner” requires' });
  await expect(verified.getByRole('listitem')).toHaveCount(10);
  await expect(verified.getByText('Photos match the rooms, bathrooms and common areas')).toBeVisible();
  await expect(page.getByText('Public replies to reviews')).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test('O5: the menu editor copies last week onto an empty week', async ({ browser }) => {
  const hostels = await apiGet<Owned[]>(DEMO_OWNER, '/owner/hostels');
  const partner = hostels.find((h) => h.partnerStatus === 'verified')!;
  // The seed has this week's and next week's menus; the week after is empty.
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const monday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - ((ist.getUTCDay() + 6) % 7)));
  const week = (n: number) => new Date(monday.getTime() + n * 7 * 86_400_000).toISOString().slice(0, 10);
  const next = await apiGet<{ theme: string } | null>(DEMO_OWNER, `/owner/hostels/${partner.id}/menus/${week(1)}`);
  const owner = await signIn(browser, DEMO_OWNER, { next: `/owner/hostels/${partner.id}/menu?week=${week(2)}` });
  owner.once('dialog', (d) => d.accept());
  await owner.getByRole('button', { name: 'Copy last week' }).click();
  await expect(owner.getByText("Copied last week's menu")).toBeVisible();
  await expect(owner.locator('input[name=theme]')).toHaveValue(next!.theme);
  await owner.context().close();
});
