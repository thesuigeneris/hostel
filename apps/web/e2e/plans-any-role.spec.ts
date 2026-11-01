import { type Browser, expect, test } from '@playwright/test';
import { API, apiGet, DEMO_OWNER, OTP, publicGet, signIn, WEB } from './helpers';

/** A plan belongs to the person, not the role: owners can live in someone else's hostel. */

const json = { 'content-type': 'application/json' };
const run = Date.now().toString().slice(-7);

type Detail = { id: string; slug: string; name: string; ownerId: string; isVerified: boolean; roomTypes: { id: string; bedsAvailable: number }[] };

async function otpLogin(phone: string, role?: 'owner') {
  await fetch(`${API}/auth/otp`, { method: 'POST', headers: json, body: JSON.stringify({ phone }) });
  const res = await fetch(`${API}/auth/verify`, { method: 'POST', headers: json, body: JSON.stringify({ phone, otp: OTP, role }) });
  return (await res.json()) as { token: string; user: { id: string; role: string } };
}

async function post(token: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { ...json, authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

/** A verified partner hostel with a free bed that `userId` doesn't own. */
async function bookableHostel(notOwnedBy: string): Promise<Detail> {
  const { items } = await publicGet<{ items: { slug: string }[] }>('/hostels?verified=true&limit=50');
  for (const { slug } of items) {
    const h = await publicGet<Detail>(`/hostels/${slug}`);
    if (h.ownerId !== notOwnedBy && h.roomTypes.some((r) => r.bedsAvailable > 0)) return h;
  }
  throw new Error('no bookable hostel in the seed');
}

async function pageWithSession(browser: Browser, token: string) {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'hostels_session', value: token, url: WEB }]);
  return context.newPage();
}

test('a subscriber who later signs in as an owner still sees and manages their plan', async ({ browser }) => {
  const phone = `973${run}`;
  const tenant = await otpLogin(phone);
  const h = await bookableHostel(tenant.user.id);
  const room = h.roomTypes.find((r) => r.bedsAvailable > 0)!;
  const sub = await post(tenant.token, `/hostels/${h.id}/subscribe`, { roomTypeId: room.id, mealPlan: 'none' });
  await post(tenant.token, `/payments/${sub.invoice.id}/simulate`);

  const owner = await otpLogin(phone, 'owner');
  expect(owner.user.role).toBe('owner');
  const page = await pageWithSession(browser, owner.token);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'My plan' })).toBeVisible();
  await expect(page.getByRole('link', { name: h.name })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bills' })).toBeVisible();
  await page.getByRole('link', { name: 'Move hostel or room' }).click();
  await expect(page).toHaveURL(/\/account\/move/);
  await expect(page.getByRole('heading', { name: 'Move hostel or room' })).toBeVisible();
  await page.context().close();
});

test('an owner subscribes at someone else\'s hostel and finds the plan under My plan', async ({ browser }) => {
  const phone = `974${run}`;
  const page = await signIn(browser, phone, { owner: true, name: 'Owner Who Rents' });
  const me = await apiGet<{ id: string; role: string }>(phone, '/me');
  expect(me.role).toBe('owner');
  const h = await bookableHostel(me.id);

  await page.goto(`/hostels/${h.slug}`);
  await page.getByRole('link', { name: 'Subscribe' }).click();
  await expect(page).toHaveURL(new RegExp(`/subscribe/${h.slug}`));
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/\/pay\/inv_/);
  await page.getByRole('button', { name: /simulated/ }).click();
  await expect(page.getByText('Payment received. Thank you!')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My plan' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('link', { name: h.name })).toBeVisible();
  await page.context().close();
});

test('an owner is not offered a plan at their own hostel', async ({ browser }) => {
  const owned = await apiGet<{ id: string; slug: string }[]>(DEMO_OWNER, '/owner/hostels');
  let own: Detail | null = null;
  for (const o of owned) {
    const h = await publicGet<Detail>(`/hostels/${o.slug}`).catch(() => null);
    if (h?.isVerified) {
      own = h;
      break;
    }
  }
  expect(own, 'the demo owner has a verified hostel').not.toBeNull();
  const page = await signIn(browser, DEMO_OWNER, { next: `/hostels/${own!.slug}` });
  const aside = page.getByRole('complementary', { name: 'Price and contact' });
  await expect(aside.getByText(/You own this hostel, so you can.t take a plan here/)).toBeVisible();
  await expect(aside.getByRole('link', { name: 'Subscribe' })).toHaveCount(0);
  await expect(aside.getByRole('link', { name: 'Manage this hostel' })).toBeVisible();

  // Typing the address gets an explanation, not a form.
  await page.goto(`/subscribe/${own!.slug}`);
  await expect(page.getByText('This is your hostel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to payment' })).toHaveCount(0);
  await page.context().close();
});
