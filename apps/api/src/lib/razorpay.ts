import { hmacHex, safeEqual } from './crypto';
import { env } from './env';

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

/** Signatures in stub mode, so the "simulate payment" button can complete a payment locally. */
export const STUB_SIGNATURE_SECRET = 'stub-razorpay-secret';

export function isRazorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getKeyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? 'rzp_test_stub';
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
  // Stub signatures are only accepted outside production.
  if (!isRazorpayConfigured() && env.isProduction) return false;
  return safeEqual(signPayment(opts.orderId, opts.paymentId), opts.signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  return safeEqual(hmacHex(secret, rawBody), signature);
}
