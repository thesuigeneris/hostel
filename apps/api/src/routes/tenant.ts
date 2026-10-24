import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { istDate, schemas } from '@hostels/shared';
import { db, schema } from '../db';
import { currentUser, requireAuth } from '../lib/auth';
import { body, parse } from '../lib/http';
import { toInvoice, toVisitRequest } from '../lib/serialize-tenant';
import type { AppEnv } from '../lib/types';
import { invoicesForUser } from '../services/billing';
import { cancelMove, scheduleMove } from '../services/moves';
import { skipMeal, tenantMenu, unskipMeal } from '../services/skips';
import { cancelSubscription, myStay, subscribe } from '../services/subscriptions';

/** Tenant routes: subscriptions, my stay, invoices, menu + skips, moves, cancel, my visits. */
export const tenantRoutes = new Hono<AppEnv>()
  .use('/me/*', requireAuth)
  .use('/subscriptions', requireAuth)
  .get('/me/visits', async (c) => {
    const rows = await db
      .select({ visit: schema.visitRequests, hostel: schema.hostels, user: schema.users })
      .from(schema.visitRequests)
      .innerJoin(schema.hostels, eq(schema.hostels.id, schema.visitRequests.hostelId))
      .innerJoin(schema.users, eq(schema.users.id, schema.visitRequests.userId))
      .where(eq(schema.visitRequests.userId, currentUser(c).id))
      .orderBy(desc(schema.visitRequests.createdAt));
    return c.json(
      rows.map(({ visit, hostel, user }) => ({
        ...toVisitRequest(visit),
        hostel: { id: hostel.id, name: hostel.name, slug: hostel.slug },
        user: { id: user.id, name: user.name, phone: user.phone },
      })),
    );
  })
  .post('/subscriptions', async (c) => {
    const input = await body(c, schemas.subscribeInput);
    return c.json(await subscribe(currentUser(c).id, input), 201);
  })
  .get('/me/stay', async (c) => c.json(await myStay(currentUser(c).id)))
  .get('/me/invoices', async (c) => {
    const today = istDate();
    return c.json((await invoicesForUser(currentUser(c).id)).map((i) => toInvoice(i, today)));
  })
  .get('/me/menu', async (c) => c.json(await tenantMenu(currentUser(c).id)))
  .post('/me/skips', async (c) => {
    const { date, meal } = await body(c, schemas.skipInput);
    return c.json(await skipMeal(currentUser(c).id, date, meal), 201);
  })
  .delete('/me/skips/:date/:meal', async (c) => {
    const { date, meal } = parse(schemas.skipInput, { date: c.req.param('date'), meal: c.req.param('meal') });
    await unskipMeal(currentUser(c).id, date, meal);
    return c.json({ ok: true as const });
  })
  .post('/me/moves', async (c) => {
    const input = await body(c, schemas.moveInput);
    return c.json(await scheduleMove(currentUser(c).id, input), 201);
  })
  .delete('/me/moves/:id', async (c) => c.json(await cancelMove(currentUser(c).id, c.req.param('id'))))
  .post('/me/subscription/cancel', async (c) => c.json(await cancelSubscription(currentUser(c).id)));
