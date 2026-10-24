import { hmacSha256Hex, randomToken, safeEqual } from './crypto';

type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

const keyId = () => process.env.RAZORPAY_KEY_ID;
const keySecret = () => process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = () => process.env.RAZORPAY_WEBHOOK_SECRET;

export function isRazorpayConfigured(): boolean {
  return !!(keyId() && keySecret());
}

export function getKeyId(): string {
  return keyId() ?? 'rzp_test_stub';
}

export async function createOrder(opts: { amountInPaise: number; receipt: string; notes?: Record<string, string> }): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured()) {
    return { id: `order_stub_${randomToken(8)}`, amount: opts.amountInPaise, currency: 'INR', status: 'created' };
  }
  const credentials = Buffer.from(`${keyId()}:${keySecret()}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
    body: JSON.stringify({ amount: opts.amountInPaise, currency: 'INR', receipt: opts.receipt.slice(0, 40), notes: opts.notes ?? {} }),
  });
  if (!res.ok) throw new Error(`razorpay order failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as RazorpayOrder;
}

/** Checkout signature: HMAC-SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(opts: { orderId: string; paymentId: string; signature: string }): boolean {
  const secret = keySecret();
  if (!secret) return false; // stub mode uses the /simulate endpoint instead
  return safeEqual(hmacSha256Hex(secret, `${opts.orderId}|${opts.paymentId}`), opts.signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = webhookSecret();
  if (!secret) return false;
  return safeEqual(hmacSha256Hex(secret, rawBody), signature);
}
