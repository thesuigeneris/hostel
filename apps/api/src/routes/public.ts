import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { istDate, schemas, weekStart, isIsoDate } from '@hostels/shared';
import { z } from 'zod';
import { db, schema } from '../db';
import { currentUser, requireAuth } from '../lib/auth';
import { body, err, parse } from '../lib/http';
import { toVisitRequest } from '../lib/serialize-tenant';
import type { AppEnv } from '../lib/types';
import { newId, addDays } from '@hostels/shared';
import { hostelDetail, liveHostelBySlug } from '../services/hostel-read';
import { activeFoodPartners, areas, menuWeekFor, publicIssues, publishedReviews, recordView } from '../services/public-read';
import { searchHostels } from '../services/search';

const pageQuery = z.object({ page: z.coerce.number().int().min(1).optional() });

async function liveOr404(slug: string) {
  const h = await liveHostelBySlug(slug);
  if (!h) throw err.notFound('Hostel');
  return h;
}

/** Seeker-facing public routes: search, hostel pages, areas, menus, public reviews/issues, views, visit requests. */
export const publicRoutes = new Hono<AppEnv>()
  .get('/hostels', async (c) => {
    const raw: Record<string, string> = { ...c.req.query() };
    for (const [k, v] of Object.entries(raw)) if (v === '') delete raw[k];
    return c.json(await searchHostels(parse(schemas.hostelSearchQuery, raw)));
  })
  .get('/hostels/:slug', async (c) => c.json(await hostelDetail(await liveOr404(c.req.param('slug')))))
  .get('/hostels/:slug/menu', async (c) => {
    const h = await liveOr404(c.req.param('slug'));
    const week = c.req.query('week');
    if (week && !isIsoDate(week)) throw err.validation('week must be a date (YYYY-MM-DD)');
    if (h.partnerStatus !== 'verified') return c.json(null);
    return c.json(await menuWeekFor(h.id, weekStart(week ?? istDate())));
  })
  .get('/hostels/:slug/reviews', async (c) => {
    const h = await liveOr404(c.req.param('slug'));
    const { page } = parse(pageQuery, c.req.query());
    return c.json(await publishedReviews(h.id, page));
  })
  .get('/hostels/:slug/issues', async (c) => {
    const h = await liveOr404(c.req.param('slug'));
    const { page } = parse(pageQuery, c.req.query());
    return c.json(await publicIssues(h.id, c.get('user')?.id ?? null, page));
  })
  .post('/hostels/:slug/view', async (c) => {
    const h = await liveOr404(c.req.param('slug'));
    await recordView(h.id);
    return c.json({ ok: true as const });
  })
  .post('/hostels/:id/visits', requireAuth, async (c) => {
    const input = await body(c, schemas.visitRequestInput);
    const [h] = await db
      .select()
      .from(schema.hostels)
      .where(and(eq(schema.hostels.id, c.req.param('id')), eq(schema.hostels.status, 'live')));
    if (!h) throw err.notFound('Hostel');
    const today = istDate();
    if (input.preferredDate < today) throw err.validation('Pick today or a later date', [{ path: 'preferredDate', message: 'Pick today or a later date' }]);
    if (input.preferredDate > addDays(today, 90)) throw err.validation('Pick a date within 90 days', [{ path: 'preferredDate', message: 'Pick a date within 90 days' }]);
    const [v] = await db
      .insert(schema.visitRequests)
      .values({ id: newId('vis'), hostelId: h.id, userId: currentUser(c).id, preferredDate: input.preferredDate, message: input.message })
      .returning();
    return c.json(toVisitRequest(v!), 201);
  })
  .get('/areas', async (c) => c.json(await areas()))
  .get('/food-partners', async (c) => c.json(await activeFoodPartners()));
