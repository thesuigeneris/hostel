import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

/** Tenant routes: subscriptions, my stay, invoices, menu + skips, moves, cancel, my visits. */
export const tenantRoutes = new Hono<AppEnv>();
