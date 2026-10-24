import type { Health } from '@hostels/shared';
import { searchSchema } from '@hostels/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, pingDb, schema } from '../db';
import { notFound } from '../lib/errors';
import { isMsg91Configured } from '../lib/msg91';
import { isRazorpayConfigured } from '../lib/razorpay';
import { parseQuery } from '../lib/validate';
import type { AppEnv } from '../middleware/auth';
import { listFoodPartners, publicMenu } from '../services/food';
import { listAreas, liveSlugs, publicHostelBySlug } from '../services/listings';
import { hostelReviews } from '../services/residents';
import { searchHostels } from '../services/search';

export const API_VERSION = '0.2.0';

async function liveHostel(slug: string) {
  const [h] = await getDb()
    .select()
    .from(schema.hostels)
    .where(and(eq(schema.hostels.slug, slug), eq(schema.hostels.status, 'live')));
  if (!h) throw notFound('Hostel');
  return h;
}

export const publicRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const razorpay = isRazorpayConfigured() ? 'live' : 'stub';
    const msg91 = isMsg91Configured() ? 'live' : 'stub';
    const health: Health = {
      ok: true,
      service: 'hostels-api',
      version: API_VERSION,
      db: (await pingDb()) ? 'up' : 'down',
      razorpay,
      msg91,
      devMode: razorpay === 'stub' || msg91 === 'stub',
    };
    return c.json(health);
  })
  .get('/hostels', async (c) => c.json(await searchHostels(parseQuery(c, searchSchema))))
  .get('/areas', async (c) => c.json(await listAreas()))
  .get('/sitemap-data', async (c) => c.json({ hostels: await liveSlugs(), areas: await listAreas() }))
  .get('/food-partners', async (c) => c.json(await listFoodPartners(true)))
  .get('/hostels/:slug', async (c) => c.json(await publicHostelBySlug(c.req.param('slug'))))
  .get('/hostels/:slug/reviews', async (c) => {
    const { page } = parseQuery(c, z.object({ page: z.coerce.number().int().min(1).max(100).default(1) }));
    const h = await liveHostel(c.req.param('slug'));
    return c.json(await hostelReviews(h.id, { page }));
  })
  .get('/hostels/:slug/menu', async (c) => {
    const { date } = parseQuery(c, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
    const h = await liveHostel(c.req.param('slug'));
    if (h.partnerStatus !== 'verified') return c.json(null);
    return c.json(await publicMenu(h.id, date));
  });
