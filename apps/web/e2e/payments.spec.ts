import { createHmac } from 'node:crypto';
import { type Browser, expect, test } from '@playwright/test';
import { ADMIN, API, OTP, publicGet, signIn, WEB } from './helpers';

/**
 * Money that isn't real stays out of the money figures (edge case M3), and a payment that reaches us after its bill
 * closed is recorded as a refund the payer is told about and an admin settles (edge case M1). This instance runs
 * without Razorpay keys, so every payment here is simulated.
 */

test.describe.configure({ mode: 'serial' });

const json = { 'content-type': 'application/json' };
const run = Date.now().toString().slice(-7);
// The API signs stub-mode checkouts with this published secret (apps/api/src/lib/razorpay.ts), as the browser would get
// back from Razorpay Checkout.
const STUB_SECRET = 'stub-razorpay-secret';

type Detail = { id: string; slug: string; name: string; ownerId: string; roomTypes: { id: string; bedsAvailable: number }[] };

async function otpLogin(phone: string) {
  await fetch(`${API}/auth/otp`, { method: 'POST', headers: json, body: JSON.stringify({ phone }) });
  const res = await fetch(`${API}/auth/verify`, { method: 'POST', headers: json, body: JSON.stringify({ phone, otp: OTP }) });
  return (await res.json()) as { token: string; user: { id: string } };
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
async function bookableHostel(notOwnedBy: string): Promise<Detail & { roomId: string }> {
  const { items } = await publicGet<{ items: { slug: string }[] }>('/hostels?verified=true&limit=50');
  for (const { slug } of items) {
    const h = await publicGet<Detail>(`/hostels/${slug}`);
    const room = h.roomTypes.find((r) => r.bedsAvailable > 0);
    if (h.ownerId !== notOwnedBy && room) return { ...h, roomId: room.id };
  }
  throw new Error('no bookable hostel in the seed');
}

async function pageWithSession(browser: Browser, token: string) {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'hostels_session', value: token, url: WEB }]);
  return context.newPage();
}

test('simulated payments are shown apart and never counted as revenue or paid out', async ({ browser }) => {
  const tenant = await otpLogin(`977${run}`);
  const h = await bookableHostel(tenant.user.id);
  const sub = await post(tenant.token, `/hostels/${h.id}/subscribe`, { roomTypeId: h.roomId, mealPlan: 'none' });
  const paid = await post(tenant.token, `/payments/${sub.invoice.id}/simulate`);
  expect(paid.invoice).toMatchObject({ status: 'paid', paymentMode: 'simulated' });

  const admin = await signIn(browser, ADMIN, { next: '/admin' });
  await expect(admin.getByRole('heading', { name: /Money received · .+ so far/ })).toBeVisible();
  await expect(admin.getByText('Real money only: payments through live Razorpay.')).toBeVisible();
  await expect(admin.getByText(/Not counted: ₹[\d,]+ simulated/)).toBeVisible();
  // Nothing on this instance is real money.
  await expect(admin.getByText('Our revenue', { exact: true }).locator('xpath=..')).toContainText('₹0');

  const month = new Date(Date.parse(paid.invoice.paidAt) + 5.5 * 3600_000).toISOString().slice(0, 7); // IST month
  await admin.goto(`/admin/payouts?month=${month}`);
  await expect(admin.getByText(/Not counted: ₹[\d,]+ simulated .*so it is never paid out/)).toBeVisible();
  await admin.context().close();
});

test('a payment that lands after its bill closed is refunded: the payer is told and an admin records it', async ({ browser }) => {
  // Checkout is open when the plan is cancelled; the payment reaches us afterwards.
  const tenant = await otpLogin(`978${run}`);
  const h = await bookableHostel(tenant.user.id);
  const sub = await post(tenant.token, `/hostels/${h.id}/subscribe`, { roomTypeId: h.roomId, mealPlan: 'none' });
  const order = await post(tenant.token, `/payments/${sub.invoice.id}/order`);
  await post(tenant.token, '/me/subscription/cancel');
  const paymentId = `pay_e2e${run}`;
  const signature = createHmac('sha256', STUB_SECRET).update(`${order.orderId}|${paymentId}`).digest('hex');
  const late = await post(tenant.token, `/payments/${sub.invoice.id}/verify`, { razorpayOrderId: order.orderId, razorpayPaymentId: paymentId, razorpaySignature: signature });
  expect(late.refund).toMatchObject({ reason: 'bill_cancelled', status: 'refund_due', razorpayPaymentId: paymentId });

  const payer = await pageWithSession(browser, tenant.token);
  await payer.goto(`/pay/${sub.invoice.id}`);
  await expect(payer.getByRole('heading', { name: 'Payment not used' })).toBeVisible();
  await expect(payer.getByText(/this bill was cancelled before the payment reached us/)).toBeVisible();
  await expect(payer.getByText(`Payment reference ${paymentId}`)).toBeVisible();
  await expect(payer.getByRole('button', { name: /Pay/ })).toHaveCount(0);

  const admin = await signIn(browser, ADMIN, { next: '/admin' });
  // The admin home counts refunds due and links to them.
  await admin.locator('a[href="/admin/billing#refunds"]').click();
  await expect(admin).toHaveURL(/\/admin\/billing#refunds$/);
  await expect(admin.getByRole('heading', { name: /Payments to refund/ })).toBeVisible();
  const row = admin.getByRole('row', { name: new RegExp(paymentId) });
  await expect(row).toContainText('Bill was cancelled');
  admin.once('dialog', (d) => d.accept());
  await row.getByRole('textbox').fill('Refunded in Razorpay, rfnd_e2e');
  await row.getByRole('button', { name: 'Mark refunded' }).click();
  await expect(admin.getByText('Marked as refunded')).toBeVisible();
  await expect(admin.getByRole('row', { name: new RegExp(paymentId) })).toContainText('Refunded');

  await admin.goto('/admin/audit?action=payment.refunded');
  await expect(admin.getByText(/Refunded in Razorpay, rfnd_e2e/)).toBeVisible();

  await payer.reload();
  await expect(payer.getByRole('heading', { name: 'Refunded' })).toBeVisible();
  await admin.context().close();
  await payer.context().close();
});
