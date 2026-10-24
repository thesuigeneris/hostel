import { Hono } from 'hono';
import { schemas } from '@hostels/shared';
import { currentUser, requireAuth } from '../lib/auth';
import { body } from '../lib/http';
import { toUser } from '../lib/serialize';
import type { AppEnv } from '../lib/types';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import * as auth from '../services/auth';

export const authRoutes = new Hono<AppEnv>()
  .post('/auth/otp', async (c) => {
    const { phone } = await body(c, schemas.otpRequestInput);
    const result = await auth.requestOtp(phone);
    return c.json({ ok: true as const, ...result });
  })
  .post('/auth/verify', async (c) => {
    const input = await body(c, schemas.otpVerifyInput);
    const s = await auth.verifyOtp(input);
    return c.json({ user: toUser(s.user), token: s.token, expiresAt: s.expiresAt.toISOString() });
  })
  .post('/auth/logout', requireAuth, async (c) => {
    const token = (c.req.header('Authorization') ?? '').replace(/^Bearer /, '');
    await auth.logout(token);
    return c.json({ ok: true as const });
  })
  .get('/me', requireAuth, (c) => c.json(toUser(currentUser(c))))
  .patch('/me', requireAuth, async (c) => {
    const input = await body(c, schemas.updateMeInput);
    const [u] = await db.update(schema.users).set(input).where(eq(schema.users.id, currentUser(c).id)).returning();
    return c.json(toUser(u!));
  });
