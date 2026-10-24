import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, schema } from '../db';
import { type AppEnv, requireAuth } from '../middleware/auth';
import { toHostel } from '../services/mappers';

export const ownerRoutes = new Hono<AppEnv>()
  .use('/owner/*', requireAuth('owner'))
  .get('/owner/hostels', async (c) => {
    const rows = await getDb()
      .select()
      .from(schema.hostels)
      .where(eq(schema.hostels.ownerId, c.get('user').id))
      .orderBy(asc(schema.hostels.createdAt));
    return c.json(rows.map(toHostel));
  });
