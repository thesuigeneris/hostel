import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, schema } from '../db';
import { type AppEnv, requireAuth } from '../middleware/auth';

export const tenantRoutes = new Hono<AppEnv>()
  .use('/me/subscription', requireAuth('tenant'))
  .get('/me/subscription', async (c) => {
    const s = schema.subscriptions;
    const [sub] = await getDb()
      .select()
      .from(s)
      .where(and(eq(s.userId, c.get('user').id), inArray(s.status, ['pending', 'active'])))
      .limit(1);
    return c.json(sub ? { ...sub, createdAt: sub.createdAt.toISOString() } : null);
  });
