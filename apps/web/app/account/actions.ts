'use server';

import type { Meal, MealPlan, Diet } from '@hostels/shared';
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

export async function simulatePaymentAction(form: FormData) {
  const id = str(form, 'invoiceId');
  await run(`/pay/${id}`, async () => (await api()).payments.simulate(id), { ok: 'Payment received. Thank you!' });
}

/** Called from the Razorpay Checkout handler in the browser. Returns an error message, or redirects on success. */
export async function createOrderAction(invoiceId: string) {
  return (await api()).payments.order(invoiceId);
}

export async function verifyPaymentAction(invoiceId: string, payment: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
  try {
    await (await api()).payments.verify(invoiceId, payment);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Payment could not be verified' };
  }
  redirect(`/pay/${invoiceId}?ok=${encodeURIComponent('Payment received. Thank you!')}`);
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
