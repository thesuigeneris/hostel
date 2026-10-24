import {
  endResidencySchema,
  hostelInputSchema,
  hostelUpdateSchema,
  isValidDate,
  menuWeekInputSchema,
  monthSchema,
  ownerPlanChangeSchema,
  ownerReplySchema,
  photoInputSchema,
  photoOrderSchema,
  rentRecordSchema,
  residentInputSchema,
  roomTypeInputSchema,
  roomTypeUpdateSchema,
  VISIT_STATUSES,
  visitStatusSchema,
} from '@hostels/shared';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { parseBody, parseQuery } from '../lib/validate';
import { type AppEnv, requireAuth } from '../middleware/auth';
import { hostelIdsOwnedBy, ownedHostel } from '../services/access';
import { openReports, ownerIssues } from '../services/community';
import { copyLastWeek, headcount, ownerMenu, saveMenu, subscribers } from '../services/food';
import { hostelInsights } from '../services/insights';
import {
  addPhoto,
  addRoomType,
  applyForPartner,
  createHostel,
  deletePhoto,
  deleteRoomType,
  ownerHostelDetail,
  reorderPhotos,
  submitHostel,
  updateHostel,
  updateRoomType,
} from '../services/listings';
import { toHostel } from '../services/mappers';
import { brandKit, ownerPartnerInfo } from '../services/partners';
import { ownerPayouts } from '../services/payouts';
import { changePlan, getPlan } from '../services/plans';
import { addResident, endResident, hostelReviews, recordRent, rentSheet, replyToReview, roster } from '../services/residents';
import { ownerVisits, setVisitStatus } from '../services/visits';

const dateQuery = z.object({ date: z.string().refine(isValidDate).optional() });

export const ownerRoutes = new Hono<AppEnv>()
  .use('/owner/*', requireAuth('owner'))
  .get('/owner/hostels', async (c) => {
    const rows = await getDb()
      .select()
      .from(schema.hostels)
      .where(eq(schema.hostels.ownerId, c.get('user').id))
      .orderBy(asc(schema.hostels.createdAt));
    return c.json(rows.map(toHostel));
  })
  .post('/owner/hostels', async (c) => c.json(await createHostel(c.get('user'), await parseBody(c, hostelInputSchema)), 201))
  .get('/owner/hostels/:id', async (c) => c.json(await ownerHostelDetail(c.get('user'), c.req.param('id'))))
  .patch('/owner/hostels/:id', async (c) =>
    c.json(await updateHostel(c.get('user'), c.req.param('id'), await parseBody(c, hostelUpdateSchema))),
  )
  .post('/owner/hostels/:id/submit', async (c) => c.json(await submitHostel(c.get('user'), c.req.param('id'))))
  .post('/owner/hostels/:id/partner', async (c) => c.json(await applyForPartner(c.get('user'), c.req.param('id'))))
  .get('/owner/hostels/:id/partner', async (c) => c.json(await ownerPartnerInfo(c.get('user'), c.req.param('id'))))
  .get('/owner/hostels/:id/brand-kit', async (c) => c.json(await brandKit(c.get('user'), c.req.param('id'))))
  .get('/owner/hostels/:id/insights', async (c) => {
    const { month } = parseQuery(c, z.object({ month: monthSchema.optional() }));
    return c.json(await hostelInsights(c.get('user'), c.req.param('id'), month ?? clock.today().slice(0, 7)));
  })

  // Rooms and photos.
  .post('/owner/hostels/:id/rooms', async (c) =>
    c.json(await addRoomType(c.get('user'), c.req.param('id'), await parseBody(c, roomTypeInputSchema)), 201),
  )
  .patch('/owner/rooms/:roomId', async (c) =>
    c.json(await updateRoomType(c.get('user'), c.req.param('roomId'), await parseBody(c, roomTypeUpdateSchema))),
  )
  .delete('/owner/rooms/:roomId', async (c) => {
    await deleteRoomType(c.get('user'), c.req.param('roomId'));
    return c.json({ ok: true as const });
  })
  .post('/owner/hostels/:id/photos', async (c) => {
    const { url } = await parseBody(c, photoInputSchema);
    return c.json(await addPhoto(c.get('user'), c.req.param('id'), url), 201);
  })
  .delete('/owner/hostels/:id/photos/:photoId', async (c) => {
    await deletePhoto(c.get('user'), c.req.param('id'), c.req.param('photoId'));
    return c.json({ ok: true as const });
  })
  .put('/owner/hostels/:id/photos/order', async (c) => {
    const { photoIds } = await parseBody(c, photoOrderSchema);
    return c.json(await reorderPhotos(c.get('user'), c.req.param('id'), photoIds));
  })

  // Visits.
  .get('/owner/visits', async (c) => {
    const { status } = parseQuery(c, z.object({ status: z.enum(VISIT_STATUSES).optional() }));
    return c.json(await ownerVisits(c.get('user'), status));
  })
  .patch('/owner/visits/:id', async (c) => {
    const { status } = await parseBody(c, visitStatusSchema);
    return c.json(await setVisitStatus(c.get('user'), c.req.param('id'), status));
  })

  // Food, headcount, subscribers, payouts (partners).
  .get('/owner/hostels/:id/menus/:weekStart', async (c) =>
    c.json(await ownerMenu(c.get('user'), c.req.param('id'), c.req.param('weekStart'))),
  )
  .put('/owner/hostels/:id/menus/:weekStart', async (c) =>
    c.json(await saveMenu(c.get('user'), c.req.param('id'), c.req.param('weekStart'), await parseBody(c, menuWeekInputSchema))),
  )
  .post('/owner/hostels/:id/menus/:weekStart/copy-last', async (c) =>
    c.json(await copyLastWeek(c.get('user'), c.req.param('id'), c.req.param('weekStart'))),
  )
  .get('/owner/hostels/:id/headcount', async (c) => {
    const { date } = parseQuery(c, dateQuery);
    return c.json(await headcount(c.get('user'), c.req.param('id'), date ?? clock.today()));
  })
  .get('/owner/hostels/:id/subscribers', async (c) => c.json(await subscribers(c.get('user'), c.req.param('id'))))
  .get('/owner/payouts', async (c) => c.json(await ownerPayouts(c.get('user'))))

  // Plan and platform bills.
  .get('/owner/hostels/:id/plan', async (c) => c.json(await getPlan(c.get('user'), c.req.param('id'))))
  .post('/owner/hostels/:id/plan', async (c) => {
    const { plan } = await parseBody(c, ownerPlanChangeSchema);
    return c.json(await changePlan(c.get('user'), c.req.param('id'), plan));
  })

  // Residents and rent (Pro and Partner).
  .get('/owner/hostels/:id/residents', async (c) => c.json(await roster(c.get('user'), c.req.param('id'))))
  .post('/owner/hostels/:id/residents', async (c) =>
    c.json(await addResident(c.get('user'), c.req.param('id'), await parseBody(c, residentInputSchema)), 201),
  )
  .post('/owner/hostels/:id/residents/:rid/end', async (c) => {
    const { endDate } = await parseBody(c, endResidencySchema);
    return c.json(await endResident(c.get('user'), c.req.param('id'), c.req.param('rid'), endDate));
  })
  .get('/owner/hostels/:id/rent', async (c) => {
    const { month } = parseQuery(c, z.object({ month: monthSchema.optional() }));
    return c.json(await rentSheet(c.get('user'), c.req.param('id'), month ?? clock.today().slice(0, 7)));
  })
  .put('/owner/hostels/:id/rent/:rid', async (c) =>
    c.json(await recordRent(c.get('user'), c.req.param('id'), c.req.param('rid'), await parseBody(c, rentRecordSchema))),
  )

  // Issues, reviews and reports across the owner's hostels.
  .get('/owner/issues', async (c) => c.json(await ownerIssues(c.get('user'))))
  .get('/owner/reports', async (c) => c.json(await openReports({ hostelIds: await hostelIdsOwnedBy(c.get('user').id) })))
  .get('/owner/hostels/:id/reviews', async (c) => {
    const h = await ownedHostel(c.get('user'), c.req.param('id'));
    return c.json(await hostelReviews(h.id, { includeHidden: true }));
  })
  .post('/owner/reviews/:id/reply', async (c) => {
    const { reply } = await parseBody(c, ownerReplySchema);
    return c.json(await replyToReview(c.get('user'), c.req.param('id'), reply));
  });
