import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

/** Payment routes for tenant invoices (inv_) and owner software invoices (sin_): checkout, verify, simulate. */
export const paymentsRoutes = new Hono<AppEnv>();
