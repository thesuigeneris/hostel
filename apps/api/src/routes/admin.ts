import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

/** Admin console routes. */
export const adminRoutes = new Hono<AppEnv>();
