import { verifyPaymentSchema } from '@hostels/shared';
import { Hono } from 'hono';
import { AppError } from '../lib/errors';
import { verifyWebhookSignature } from '../lib/razorpay';
import { parseBody } from '../lib/validate';
import { type AppEnv, requireAuth } from '../middleware/auth';
import { markOrderPaid, orderFor, paymentPage, simulatePayment, verifyCheckout } from '../services/payments';

export const paymentRoutes = new Hono<AppEnv>()
  .use('/payments/*', requireAuth())
  .get('/payments/:id', async (c) => c.json(await paymentPage(c.get('user'), c.req.param('id'))))
  .post('/payments/:id/order', async (c) => c.json(await orderFor(c.get('user'), c.req.param('id'))))
  .post('/payments/:id/verify', async (c) =>
    c.json(await verifyCheckout(c.get('user'), c.req.param('id'), await parseBody(c, verifyPaymentSchema))),
  )
  .post('/payments/:id/simulate', async (c) => c.json(await simulatePayment(c.get('user'), c.req.param('id'))));

/** Razorpay webhook: verified against the raw body, idempotent with the checkout callback. */
export const webhookRoutes = new Hono<AppEnv>().post('/webhooks/razorpay', async (c) => {
  const signature = c.req.header('x-razorpay-signature') ?? '';
  const raw = await c.req.text();
  if (!verifyWebhookSignature(raw, signature)) throw new AppError('signature_invalid', 'Webhook signature did not verify', 400);
  let payload: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new AppError('validation', 'Webhook body must be JSON', 400);
  }
  const entity = payload.payload?.payment?.entity;
  if ((payload.event === 'payment.captured' || payload.event === 'order.paid') && entity?.id && entity.order_id) {
    try {
      await markOrderPaid(entity.order_id, entity.id);
    } catch (e) {
      // Unknown or cancelled orders are acknowledged so Razorpay stops retrying; they are logged for follow-up.
      if (!(e instanceof AppError)) throw e;
      console.error(`[webhook] ${e.code}: ${e.message} (order ${entity.order_id})`);
    }
  }
  return c.json({ ok: true });
});
