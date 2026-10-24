import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

/** Seeker-facing public routes: search, hostel pages, areas, menus, public reviews/issues, views, visit requests. */
export const publicRoutes = new Hono<AppEnv>();
