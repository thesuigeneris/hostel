import {
  directorySchema,

  moveSchema,
  reasonSchema,
  reviewInputSchema,
  skipSchema,
  subscribeSchema,
  visitRequestSchema,
} from '@hostels/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { parse, parseBody, parseQuery } from '../lib/validate';
import { type AppEnv, requireAuth } from '../middleware/auth';
import { cancelSubscription, myInvoices, mySubscription, subscribe } from '../services/billing';
import { myMenu, skipMeal, unskipMeal } from '../services/food';
import { cancelMove, myMoves, scheduleMove } from '../services/moves';
import {
  flagReview,
  moveOut,
  myResidencies,
  respondToInvite,
  setDirectoryOptIn,
  upsertReview,
} from '../services/residents';
import { myVisits, requestVisit } from '../services/visits';

const signedIn = requireAuth();
const tenant = requireAuth('tenant');

export const tenantRoutes = new Hono<AppEnv>()
  // Visits: any signed-in user.
  .post('/hostels/:id/visits', signedIn, async (c) =>
    c.json(await requestVisit(c.get('user'), c.req.param('id'), await parseBody(c, visitRequestSchema)), 201),
  )
  .get('/me/visits', signedIn, async (c) => c.json(await myVisits(c.get('user'))))

  // Subscription and bills. Starting a plan is for tenants; managing one is for whoever holds it,
  // since a subscriber may later sign in as a hostel owner.
  .post('/hostels/:id/subscribe', tenant, async (c) =>
    c.json(await subscribe(c.get('user'), c.req.param('id'), await parseBody(c, subscribeSchema)), 201),
  )
  .get('/me/subscription', signedIn, async (c) => c.json(await mySubscription(c.get('user'))))
  .post('/me/subscription/cancel', signedIn, async (c) => c.json(await cancelSubscription(c.get('user'))))
  .get('/me/invoices', signedIn, async (c) => c.json(await myInvoices(c.get('user'))))

  // Food.
  .get('/me/menu', signedIn, async (c) => {
    const { days } = parseQuery(c, z.object({ days: z.coerce.number().int().min(1).max(14).default(7) }));
    return c.json(await myMenu(c.get('user'), days));
  })
  .post('/me/skips', signedIn, async (c) => {
    const { date, meal } = await parseBody(c, skipSchema);
    return c.json(await skipMeal(c.get('user'), date, meal), 201);
  })
  .delete('/me/skips/:date/:meal', signedIn, async (c) => {
    const { date, meal } = parse(skipSchema, { date: c.req.param('date'), meal: c.req.param('meal') });
    return c.json(await unskipMeal(c.get('user'), date, meal));
  })

  // Moves.
  .get('/me/moves', signedIn, async (c) => c.json(await myMoves(c.get('user'))))
  .post('/me/moves', signedIn, async (c) => c.json(await scheduleMove(c.get('user'), await parseBody(c, moveSchema)), 201))
  .delete('/me/moves/:id', signedIn, async (c) => c.json(await cancelMove(c.get('user'), c.req.param('id'))))

  // Residencies and reviews: any signed-in user (owners can be residents elsewhere).
  .get('/me/residencies', signedIn, async (c) => c.json(await myResidencies(c.get('user'))))
  .post('/me/residencies/:id/accept', signedIn, async (c) => c.json(await respondToInvite(c.get('user'), c.req.param('id'), true)))
  .post('/me/residencies/:id/decline', signedIn, async (c) => c.json(await respondToInvite(c.get('user'), c.req.param('id'), false)))
  .post('/me/residencies/:id/move-out', signedIn, async (c) => c.json(await moveOut(c.get('user'), c.req.param('id'))))
  .patch('/me/residencies/:id', signedIn, async (c) => {
    const { directoryOptIn } = await parseBody(c, directorySchema);
    return c.json(await setDirectoryOptIn(c.get('user'), c.req.param('id'), directoryOptIn));
  })
  .put('/hostels/:id/review', signedIn, async (c) =>
    c.json(await upsertReview(c.get('user'), c.req.param('id'), await parseBody(c, reviewInputSchema))),
  )
  .post('/reviews/:id/flag', signedIn, async (c) => {
    const { reason } = await parseBody(c, reasonSchema);
    return c.json(await flagReview(c.get('user'), c.req.param('id'), reason));
  });

