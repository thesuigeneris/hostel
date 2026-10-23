import crypto from 'node:crypto';

type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

export function isRazorpayConfigured(): boolean {
  return !!(KEY_ID && KEY_SECRET);
}

export function getKeyId(): string {
  return KEY_ID ?? 'rzp_test_stub';
}

export async function createOrder(opts: {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured()) {
    return {
      id: `order_stub_${Date.now()}`,
      amount: opts.amountInPaise,
      currency: 'INR',
      status: 'created',
    };
  }
  const credentials = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      amount: opts.amountInPaise,
      currency: 'INR',
      receipt: opts.receipt,
      notes: opts.notes ?? {},
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`razorpay order failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RazorpayOrder;
}

export function verifyPaymentSignature(opts: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!KEY_SECRET) {
    return opts.signature.startsWith('stub_');
  }
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${opts.orderId}|${opts.paymentId}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(opts.signature));
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
