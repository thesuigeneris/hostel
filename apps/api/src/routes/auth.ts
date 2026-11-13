import {
  changePasswordSchema,
  deleteAccountSchema,
  demoLoginSchema,
  handoffRedeemSchema,
  loginSchema,
  registerSchema,
  requestOtpSchema,
  updateMeSchema,
  verifyOtpSchema,
} from '@hostels/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, schema } from '../db';
import { parseBody } from '../lib/validate';
import { type AppEnv, requireAuth } from '../middleware/auth';
import {
  authMethods,
  changePassword,
  createHandoff,
  deleteSession,
  demoLogin,
  loginWithPassword,
  redeemHandoff,
  register,
  requestOtp,
  verifyOtp,
} from '../services/auth';
import { toUser } from '../services/mappers';
import { deleteMyAccount, deletionStatus, exportMyData } from '../services/privacy';

export const authRoutes = new Hono<AppEnv>()
  .get('/auth/methods', async (c) => c.json(await authMethods()))
  .post('/auth/register', async (c) => c.json(await register(await parseBody(c, registerSchema)), 201))
  .post('/auth/login', async (c) => c.json(await loginWithPassword(await parseBody(c, loginSchema))))
  .post('/auth/demo', async (c) => {
    const { phone } = await parseBody(c, demoLoginSchema);
    return c.json(await demoLogin(phone));
  })
  .post('/me/password', requireAuth(), async (c) => {
    const input = await parseBody(c, changePasswordSchema);
    return c.json(await changePassword(c.get('user'), c.get('token'), input));
  })
  // Data rights (DPDP Act 2023): a copy of my data, and deleting my account.
  .get('/me/export', requireAuth(), async (c) => {
    c.header('Content-Disposition', 'attachment; filename="hostels-my-data.json"');
    c.header('Cache-Control', 'no-store');
    return c.json(await exportMyData(c.get('user')));
  })
  .get('/me/deletion', requireAuth(), async (c) => c.json(await deletionStatus(c.get('user'))))
  .post('/me/delete', requireAuth(), async (c) => c.json(await deleteMyAccount(c.get('user'), await parseBody(c, deleteAccountSchema))))
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
  .post('/auth/handoff', requireAuth(), async (c) => c.json(await createHandoff(c.get('user').id), 201))
  .post('/auth/handoff/redeem', async (c) => {
    const { code } = await parseBody(c, handoffRedeemSchema);
    return c.json(await redeemHandoff(code));
  })
  .get('/me', requireAuth(), (c) => c.json(c.get('user')))
  .patch('/me', requireAuth(), async (c) => {
    const patch = await parseBody(c, updateMeSchema);
    const db = getDb();
    const [row] = Object.keys(patch).length
      ? await db.update(schema.users).set(patch).where(eq(schema.users.id, c.get('user').id)).returning()
      : await db.select().from(schema.users).where(eq(schema.users.id, c.get('user').id));
    // Keep the role the session resolved (an admin no longer in ADMIN_PHONES acts as owner).
    return c.json({ ...toUser(row!), role: c.get('user').role });
  });
