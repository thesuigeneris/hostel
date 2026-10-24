import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { env } from './lib/env';
import { AppError } from './lib/errors';
import type { AppEnv } from './middleware/auth';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { ownerRoutes } from './routes/owner';
import { publicRoutes } from './routes/public';
import { tenantRoutes } from './routes/tenant';

export function createApp(opts: { log?: boolean } = {}) {
  const app = new Hono<AppEnv>();

  if (opts.log ?? true) app.use('*', logger());
  app.use('*', cors({ origin: env.corsOrigins, allowHeaders: ['Authorization', 'Content-Type'], credentials: true }));
  app.use('*', bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: 'validation', message: 'Request body is too large' }, 413) }));

  app.route('/', publicRoutes);
  app.route('/', authRoutes);
  app.route('/', tenantRoutes);
  app.route('/', ownerRoutes);
  app.route('/', adminRoutes);

  app.notFound((c) => c.json({ error: 'not_found', message: 'Route not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json(err.toBody(), err.status);
    if (err instanceof HTTPException) return c.json({ error: 'validation', message: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal', message: 'Something went wrong' }, 500);
  });

  return app;
}
