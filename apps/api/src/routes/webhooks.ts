import { Hono } from 'hono';
import { err } from '../lib/http';
import { verifyWebhookSignature } from '../lib/razorpay';
import type { AppEnv } from '../lib/types';
import { handleCapturedPayment } from '../services/payments';

type RazorpayEvent = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    order?: { entity?: { id?: string } };
  };
};

/** Razorpay webhook (idempotent). */
export const webhooksRoutes = new Hono<AppEnv>().post('/webhooks/razorpay', async (c) => {
  const raw = await c.req.text();
  if (!verifyWebhookSignature(raw, c.req.header('x-razorpay-signature') ?? '')) {
    throw err.domain('signature_invalid', 'Invalid webhook signature');
  }
  let payload: RazorpayEvent;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw err.validation('Body must be JSON');
  }
  if (payload.event === 'payment.captured' || payload.event === 'order.paid') {
    const paymentId = payload.payload?.payment?.entity?.id;
    const orderId = payload.payload?.payment?.entity?.order_id ?? payload.payload?.order?.entity?.id;
    if (orderId && paymentId) {
      const result = await handleCapturedPayment(orderId, paymentId);
      return c.json({ ok: true as const, result });
    }
  }
  return c.json({ ok: true as const, result: 'ignored' });
});
