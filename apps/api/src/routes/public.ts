import type { Health } from '@hostels/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, pingDb, schema } from '../db';
import { notFound } from '../lib/errors';
import { isMsg91Configured } from '../lib/msg91';
import { isRazorpayConfigured } from '../lib/razorpay';
import type { AppEnv } from '../middleware/auth';
import { toHostel, toRoomType } from '../services/mappers';

export const API_VERSION = '0.1.0';

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
  // Search, filters and summaries land with the listings feature; this returns live hostels.
  .get('/hostels', async (c) => {
    const rows = await getDb()
      .select()
      .from(schema.hostels)
      .where(eq(schema.hostels.status, 'live'))
      .orderBy(asc(schema.hostels.name));
    return c.json(rows.map(toHostel));
  })
  .get('/hostels/:slug', async (c) => {
    const db = getDb();
    const [hostel] = await db
      .select()
      .from(schema.hostels)
      .where(and(eq(schema.hostels.slug, c.req.param('slug')), eq(schema.hostels.status, 'live')));
    if (!hostel) throw notFound('Hostel');
    const [photos, rooms] = await Promise.all([
      db.select().from(schema.hostelPhotos).where(inArray(schema.hostelPhotos.hostelId, [hostel.id])).orderBy(asc(schema.hostelPhotos.sortOrder)),
      db.select().from(schema.roomTypes).where(eq(schema.roomTypes.hostelId, hostel.id)).orderBy(asc(schema.roomTypes.monthlyRent)),
    ]);
    return c.json({
      ...toHostel(hostel),
      isVerified: hostel.partnerStatus === 'verified',
      photos,
      roomTypes: rooms.map(toRoomType),
    });
  });
