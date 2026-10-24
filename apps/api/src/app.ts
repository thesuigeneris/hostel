import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { env } from './lib/env';
import { AppError } from './lib/errors';
import type { AppEnv } from './middleware/auth';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { ownerRoutes } from './routes/owner';
import { paymentRoutes, webhookRoutes } from './routes/payments';
import { residentRoutes } from './routes/resident';
import { uploadRoutes } from './routes/uploads';
import { publicRoutes } from './routes/public';
import { tenantRoutes } from './routes/tenant';

export function createApp(opts: { log?: boolean } = {}) {
  const app = new Hono<AppEnv>();

  if (opts.log ?? true) app.use('*', logger());
  // Photos under /uploads are shown on the website and in the app, so they may be loaded cross-origin.
  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
  app.use('*', cors({ origin: env.corsOrigins, allowHeaders: ['Authorization', 'Content-Type'], credentials: true }));
  app.use('*', async (c, next) => {
    // Uploads carry their own, larger limit.
    if (c.req.path === '/uploads') return next();
    return bodyLimit({ maxSize: 1024 * 1024, onError: (cx) => cx.json({ error: 'validation', message: 'Request body is too large' }, 413) })(c, next);
  });

  app.route('/', publicRoutes);
  app.route('/', authRoutes);
  app.route('/', tenantRoutes);
  app.route('/', ownerRoutes);
  app.route('/', adminRoutes);
  app.route('/', residentRoutes);
  app.route('/', paymentRoutes);
  app.route('/', webhookRoutes);
  app.route('/', uploadRoutes);

  app.notFound((c) => c.json({ error: 'not_found', message: 'Route not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json(err.toBody(), err.status);
    if (err instanceof HTTPException) return c.json({ error: 'validation', message: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal', message: 'Something went wrong' }, 500);
  });

  return app;
}
