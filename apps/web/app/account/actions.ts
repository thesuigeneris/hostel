'use server';

import { ApiError, type Diet, type Meal, type MealPlan } from '@hostels/shared';
import { redirect } from 'next/navigation';
import { run, safePath, str } from '@/lib/actions';
import { api } from '@/lib/api';

const back = (form: FormData, fallback: string) => safePath(str(form, '_back'), fallback);

export async function subscribeAction(form: FormData) {
  const slug = str(form, 'slug');
  await run(
    `/subscribe/${slug}`,
    async () =>
      (await api()).hostels.subscribe(str(form, 'hostelId'), {
        roomTypeId: str(form, 'roomTypeId'),
        mealPlan: str(form, 'mealPlan') as MealPlan,
        diet: (str(form, 'diet') || 'veg') as Diet,
      }),
    { to: (r) => `/pay/${r.invoice.id}` },
  );
}

/**
 * Releases a bed held for an unpaid first bill, so the person can pick again. Only a hold is released: if the bill
 * was paid in another tab meanwhile, the running plan is left alone and the page says so.
 */
export async function releaseHoldAction(form: FormData) {
  const slug = str(form, 'slug');
  const back = slug ? `/subscribe/${encodeURIComponent(slug)}` : '/account';
  await run(
    back,
    async () => {
      const client = await api();
      const mine = await client.me.subscription();
      if (!mine || mine.subscription.id !== str(form, 'subscriptionId') || mine.subscription.status !== 'pending') {
        throw new ApiError(409, 'invalid_state', 'There is no unpaid hold to release any more. This page shows where things stand now.');
      }
      return client.me.cancelSubscription();
    },
    { ok: 'The bed is released. Pick a room and food plan again.' },
  );
}

export async function simulatePaymentAction(form: FormData) {
  const id = str(form, 'invoiceId');
  await run(`/pay/${id}`, async () => (await api()).payments.simulate(id), { ok: 'Payment received. Thank you!' });
}

/** Creates (or reuses) the bill's payment order. Errors come back as values: production builds hide thrown messages. */
export async function createOrderAction(invoiceId: string) {
  try {
    return { order: await (await api()).payments.order(invoiceId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not start the payment' };
  }
}

/** Called from the Razorpay Checkout handler in the browser. Returns an error message, or redirects on success. */

export async function verifyPaymentAction(invoiceId: string, payment: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
  let refunded = false;
  try {
    const page = await (await api()).payments.verify(invoiceId, payment);
    // The payment arrived after the bill closed: the page explains the refund instead of thanking them.
    refunded = page.refund?.razorpayPaymentId === payment.razorpayPaymentId;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Payment could not be verified' };
  }
  redirect(refunded ? `/pay/${invoiceId}` : `/pay/${invoiceId}?ok=${encodeURIComponent('Payment received. Thank you!')}`);
}

export async function updateProfileAction(form: FormData) {
  await run('/account', async () => (await api()).me.update({ name: str(form, 'name'), email: str(form, 'email') || null }), { ok: 'Profile saved' });
}

/** Passwords are used exactly as typed (never trimmed). */
function rawField(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
}

export async function changePasswordAction(form: FormData) {
  const current = rawField(form, 'currentPassword');
  await run(
    '/account',
    async () => (await api()).me.setPassword({ newPassword: rawField(form, 'newPassword'), ...(current ? { currentPassword: current } : {}) }),
    { ok: 'Password saved. Other devices were signed out.' },
  );
}

export async function cancelSubscriptionAction() {
  await run('/account', async () => (await api()).me.cancelSubscription(), { ok: 'Your plan will end at the close of the current billing period.' });
}

export async function skipMealAction(form: FormData) {
  const date = str(form, 'date');
  const meal = str(form, 'meal') as Meal;
  const undo = str(form, 'undo') === '1';
  await run(back(form, '/account'), async () => {
    const client = await api();
    return undo ? client.me.unskip(date, meal) : client.me.skip({ date, meal });
  });
}

export async function scheduleMoveAction(form: FormData) {
  await run('/account', async () => (await api()).me.move({ toRoomTypeId: str(form, 'toRoomTypeId'), moveDate: str(form, 'moveDate') }), {
    ok: 'Move scheduled. Your bed is held and your next bill uses the new rent.',
  });
}

export async function cancelMoveAction(form: FormData) {
  await run('/account', async () => (await api()).me.cancelMove(str(form, 'moveId')), { ok: 'Move cancelled' });
}

export async function cancelVisitAction(form: FormData) {
  await run('/account', async () => (await api()).me.cancelVisit(str(form, 'visitId')), { ok: 'Visit request withdrawn' });
}
