import { REFUND_WITHIN_DAYS } from './pricing';
import { istDate } from './time';
import type { GenderType, NotCounted, PaymentException, PaymentExceptionReason, PaymentMode, SharingType } from './types';

/** Display helpers shared by the website and the app. Dates are ISO `YYYY-MM-DD` strings in IST. */

export const rupees = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN')}`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateLabel(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}
export function monthLabel(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m! - 1]} ${y}`;
}
export function weekday(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}
export function timeAgo(iso: string, now = Date.now()) {
  const s = (now - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const SHARING_LABEL: Record<SharingType, string> = {
  private: 'Private room',
  '2-sharing': '2 sharing',
  '3-sharing': '3 sharing',
  '4-sharing': '4 sharing',
};
export const GENDER_LABEL: Record<GenderType, string> = { boys: 'Boys', girls: 'Girls', coliving: 'Co-living' };
export const titleCase = (s: string) => s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * How a reviewer's stay was confirmed. Stays paid through Hostels are the strongest signal; residents an owner added
 * themselves are real people who accepted the invite, but the owner chose to add them, so readers are told.
 */
export function reviewSource(verifiedVia: 'subscription' | 'owner' | null): { label: string; strong: boolean } {
  if (verifiedVia === 'subscription') return { label: '✓ Verified stay · paid through Hostels', strong: true };
  if (verifiedVia === 'owner') return { label: 'Resident · added by the hostel', strong: false };
  return { label: 'Resident', strong: false };
}

/** How a bill was settled, for admin and owner tables. Only Razorpay live is real money. */
export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  razorpay_live: 'Razorpay',
  razorpay_test: 'Razorpay test mode',
  simulated: 'Simulated',
  waived: 'Waived',
};

/** "Not counted: ₹X simulated · ₹Y Razorpay test mode", or null when every payment was real money. */
export function notCountedLabel(n: NotCounted): string | null {
  const parts = [n.simulated ? `${rupees(n.simulated)} simulated` : null, n.test ? `${rupees(n.test)} Razorpay test mode` : null].filter(Boolean);
  return parts.length ? `Not counted: ${parts.join(' · ')} (no real money moved)` : null;
}

/** Why a payment could not be used, for the admin list. */
export const REFUND_REASON_LABEL: Record<PaymentExceptionReason, string> = {
  bed_taken: 'Bed hold ran out and the bed was taken',
  has_other_plan: 'Payer had started another plan',
  hostel_unavailable: 'Hostel stopped taking subscriptions',
  bill_cancelled: 'Bill was cancelled',
  bill_waived: 'Bill was waived',
  duplicate_payment: 'Bill was already paid',
};

/** Why a payment could not be used, completing "We received ₹X, but …" for the payer. */
export const REFUND_REASON_TEXT: Record<PaymentExceptionReason, string> = {
  bed_taken: 'your bed hold ran out and the last bed was taken before the payment reached us',
  has_other_plan: 'you had started another plan before the payment reached us',
  hostel_unavailable: 'the hostel stopped taking subscriptions before the payment reached us',
  bill_cancelled: 'this bill was cancelled before the payment reached us',
  bill_waived: 'this bill was waived, so there was nothing to pay',
  duplicate_payment: 'this bill had already been paid',
};

/** What the payer reads on the bill: what happened to their money and when it comes back. */
export function refundMessage(r: Pick<PaymentException, 'amount' | 'reason' | 'status' | 'refundedAt' | 'paymentMode'>): string {
  const what = `We received ${rupees(r.amount)}, but ${REFUND_REASON_TEXT[r.reason]}.`;
  if (r.paymentMode === 'simulated') return `${what} It was a simulated payment, so no money moved.`;
  if (r.status === 'refunded') return `${what} We refunded it on ${r.refundedAt ? dateLabel(istDate(new Date(r.refundedAt))) : '—'}.`;
  return `${what} We'll refund it to the account you paid from within ${REFUND_WITHIN_DAYS} days.`;
}
