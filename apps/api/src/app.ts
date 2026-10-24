import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadUser } from './lib/auth';
import { notFoundHandler, onError } from './lib/http';
import { isMsg91Configured } from './lib/msg91';
import { isRazorpayConfigured } from './lib/razorpay';
import type { AppEnv } from './lib/types';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { communityRoutes } from './routes/community';
import { ownerRoutes } from './routes/owner';
import { paymentsRoutes } from './routes/payments';
import { publicRoutes } from './routes/public';
import { tenantRoutes } from './routes/tenant';
import { uploadsRoutes } from './routes/uploads';
import { webhooksRoutes } from './routes/webhooks';

export function createApp() {
  const app = new Hono<AppEnv>();
  if (process.env.NODE_ENV !== 'test') app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: (origin) => origin ?? '*',
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use('*', loadUser);
  app.onError(onError);
  app.notFound(notFoundHandler);

  app.get('/health', (c) =>
    c.json({
      ok: true as const,
      service: 'hostels-api' as const,
      version: '0.1.0',
      razorpay: isRazorpayConfigured() ? ('live' as const) : ('stub' as const),
      msg91: isMsg91Configured() ? ('live' as const) : ('stub' as const),
      storage: process.env.R2_BUCKET ? ('r2' as const) : ('local' as const),
    }),
  );

  app.route('/', authRoutes);
  app.route('/', publicRoutes);
  app.route('/', tenantRoutes);
  app.route('/', paymentsRoutes);
  app.route('/', webhooksRoutes);
  app.route('/', communityRoutes);
  app.route('/', ownerRoutes);
  app.route('/', adminRoutes);
  app.route('/', uploadsRoutes);
  return app;
}
