import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

/** Razorpay webhook (idempotent). */
export const webhooksRoutes = new Hono<AppEnv>();
