import type { PaymentMode } from '@hostels/shared';
import { hmacHex, safeEqual } from './crypto';
import { env } from './env';

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

/** Signatures in stub mode, so the "simulate payment" button can complete a payment locally. */
export const STUB_SIGNATURE_SECRET = 'stub-razorpay-secret';

export function isRazorpayConfigured(): boolean {
  // Demo instances never move money, whatever keys are set.
  if (env.appMode === 'demo') return false;
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getKeyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? 'rzp_test_stub';
}

/** A payment mode that money can arrive in (`waived` is not a payment). */
export type ReceivedMode = Exclude<PaymentMode, 'waived'>;

/**
 * Razorpay key ids say which mode they belong to: `rzp_live_` keys take real money, `rzp_test_` keys never do. Any
 * other key id is treated as test mode, so a misconfigured key can only ever under-count money, never invent it.
 */
export function razorpayKeyMode(keyId = process.env.RAZORPAY_KEY_ID ?? ''): 'razorpay_live' | 'razorpay_test' {
  return keyId.startsWith('rzp_live_') ? 'razorpay_live' : 'razorpay_test';
}

/** How payments taken by this instance right now are recorded. */
export function instancePaymentMode(): ReceivedMode {
  return isRazorpayConfigured() ? razorpayKeyMode() : 'simulated';
}

/**
 * How a payment confirmed for `orderId` (by the checkout callback or a webhook) is recorded. Without keys, every
 * payment is simulated: stub signatures can be made by anyone who reads this code. An order the stub created is
 * simulated whatever keys are set now, since no Razorpay account ever saw it.
 */
export function paymentModeFor(orderId: string): ReceivedMode {
  if (orderId.startsWith('order_stub_')) return 'simulated';
  return instancePaymentMode();
}

function keySecret(): string {
  return process.env.RAZORPAY_KEY_SECRET ?? STUB_SIGNATURE_SECRET;
}

export async function createOrder(opts: {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured()) {
    return {
      id: `order_stub_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`,
      amount: opts.amountInPaise,
      currency: 'INR',
      status: 'created',
    };
  }
  const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
    body: JSON.stringify({ amount: opts.amountInPaise, currency: 'INR', receipt: opts.receipt, notes: opts.notes ?? {} }),
  });
  if (!res.ok) throw new Error(`razorpay order failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as RazorpayOrder;
}

export function signPayment(orderId: string, paymentId: string): string {
  return hmacHex(keySecret(), `${orderId}|${paymentId}`);
}

export function verifyPaymentSignature(opts: { orderId: string; paymentId: string; signature: string }): boolean {
  // Stub signatures are only accepted outside production, or on a demo instance (which never takes real money).
  if (!isRazorpayConfigured() && env.isProduction && env.appMode !== 'demo') return false;
  return safeEqual(signPayment(opts.orderId, opts.paymentId), opts.signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  // A demo instance must never mark bills paid from real payment events.
  if (!secret || env.appMode === 'demo') return false;
  return safeEqual(hmacHex(secret, rawBody), signature);
}
