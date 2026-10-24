import { Hono } from 'hono';
import type { AppEnv } from '../lib/types';

/** Owner dashboard routes: hostels, rooms, photos, visits, menus, headcount, subscribers, payouts, residents, rent ledger, issues, reviews, announcements, plans. */
export const ownerRoutes = new Hono<AppEnv>();
