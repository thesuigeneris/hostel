import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

/** Resident routes: residencies, residents list, posts, comments, likes, issues, upvotes, reviews. */
export const communityRoutes = new Hono<AppEnv>();
