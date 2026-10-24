import { requestOtpSchema, updateMeSchema, verifyOtpSchema } from '@hostels/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, schema } from '../db';
import { parseBody } from '../lib/validate';
import { type AppEnv, requireAuth } from '../middleware/auth';
import { deleteSession, requestOtp, verifyOtp } from '../services/auth';
import { toUser } from '../services/mappers';

export const authRoutes = new Hono<AppEnv>()
  .post('/auth/otp', async (c) => {
    const { phone } = await parseBody(c, requestOtpSchema);
    return c.json(await requestOtp(phone));
  })
  .post('/auth/verify', async (c) => {
    const input = await parseBody(c, verifyOtpSchema);
    return c.json(await verifyOtp(input));
  })
  .post('/auth/logout', requireAuth(), async (c) => {
    await deleteSession(c.get('token'));
    return c.json({ ok: true as const });
  })
  .get('/me', requireAuth(), (c) => c.json(c.get('user')))
  .patch('/me', requireAuth(), async (c) => {
    const patch = await parseBody(c, updateMeSchema);
    const db = getDb();
    const [row] = Object.keys(patch).length
      ? await db.update(schema.users).set(patch).where(eq(schema.users.id, c.get('user').id)).returning()
      : await db.select().from(schema.users).where(eq(schema.users.id, c.get('user').id));
    return c.json(toUser(row!));
  });
