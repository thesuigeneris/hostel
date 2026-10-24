import { Hono } from 'hono';
import { schemas } from '@hostels/shared';
import { currentUser, requireAuth } from '../lib/auth';
import { body } from '../lib/http';
import type { AppEnv } from '../lib/types';
import { checkout, simulate, verify } from '../services/payments';

/** Payment routes for tenant invoices (inv_) and owner software invoices (sin_): checkout, verify, simulate. */
export const paymentsRoutes = new Hono<AppEnv>()
  .use('/payments/*', requireAuth)
  .get('/payments/:invoiceId/checkout', async (c) => c.json(await checkout(c.req.param('invoiceId'), currentUser(c))))
  .post('/payments/:invoiceId/verify', async (c) => {
    const input = await body(c, schemas.paymentVerifyInput);
    return c.json(await verify(c.req.param('invoiceId'), currentUser(c), input));
  })
  .post('/payments/:invoiceId/simulate', async (c) => c.json(await simulate(c.req.param('invoiceId'), currentUser(c))));
