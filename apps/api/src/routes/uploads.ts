import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

/** Photo uploads (POST /uploads) and static serving (/uploads/*). */
export const uploadsRoutes = new Hono<AppEnv>();
