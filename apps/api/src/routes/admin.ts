import { HOSTEL_STATUSES } from '@hostels/shared';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { parseQuery } from '../lib/validate';
import { type AppEnv, requireAuth } from '../middleware/auth';
import { toHostel } from '../services/mappers';

export const adminRoutes = new Hono<AppEnv>()
  .use('/admin/*', requireAuth('admin'))
  .get('/admin/hostels', async (c) => {
    const { status } = parseQuery(c, z.object({ status: z.enum(HOSTEL_STATUSES).optional() }));
    const db = getDb();
    const query = db.select().from(schema.hostels).orderBy(asc(schema.hostels.createdAt)).$dynamic();
    const rows = await (status ? query.where(eq(schema.hostels.status, status)) : query);
    return c.json(rows.map(toHostel));
  });
