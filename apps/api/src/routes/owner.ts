import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { isIsoDate, istDate, schemas } from '@hostels/shared';
import { db, schema } from '../db';
import { currentUser, requireRole } from '../lib/auth';
import { body, err, query } from '../lib/http';
import { toHostel, toPhoto, toRoomType } from '../lib/serialize';
import { toPayout, toRentPayment, toResidency, toSaasInvoice, toVisit } from '../lib/serialize-community';
import type { AppEnv } from '../lib/types';
import { listPayouts } from '../services/admin-payouts';
import { listOwnerIssues } from '../services/community-issues';
import { createPost, togglePin } from '../services/community-posts';
import { addResident, decideResidency, ownerResidents, recordRent, rentLedger } from '../services/community-residents';
import { hostelReviewsForOwner, replyToReview } from '../services/community-reviews';
import { ownedHostel, requirePro, requireVerified } from '../services/owner-access';
import { hostelSubscribers, ownerDashboard, ownerVisits } from '../services/owner-dashboard';
import * as listings from '../services/owner-listings';
import { copyLastWeek, getMenuWeek, headcount, parseWeek, saveMenu } from '../services/owner-menus';
import { changePlan } from '../services/owner-saas';

/** Owner dashboard routes: hostels, rooms, photos, visits, menus, headcount, subscribers, payouts, residents, rent ledger, issues, reviews, announcements, plans. */
export const ownerRoutes = new Hono<AppEnv>();

ownerRoutes.use('/owner/*', requireRole('owner'));

ownerRoutes
  .get('/owner/dashboard', async (c) => c.json(await ownerDashboard(currentUser(c))))

  // ---- hostels ----
  .get('/owner/hostels', async (c) => c.json((await listings.listOwnerHostels(currentUser(c))).map(toHostel)))
  .post('/owner/hostels', async (c) => {
    const input = await body(c, schemas.hostelInput);
    return c.json(toHostel(await listings.createHostel(currentUser(c), input)), 201);
  })
  .get('/owner/hostels/:id', async (c) => {
    const h = await ownedHostel(currentUser(c), c.req.param('id'));
    return c.json(await listings.hostelDetail(h));
  })
  .patch('/owner/hostels/:id', async (c) => {
    const input = await body(c, schemas.hostelUpdateInput);
    return c.json(toHostel(await listings.updateHostel(currentUser(c), c.req.param('id'), input)));
  })
  .post('/owner/hostels/:id/submit', async (c) => c.json(toHostel(await listings.submitHostel(currentUser(c), c.req.param('id')))))
  .post('/owner/hostels/:id/apply-partner', async (c) => c.json(toHostel(await listings.applyPartner(currentUser(c), c.req.param('id')))))
  .post('/owner/hostels/:id/plan', async (c) => {
    const { plan } = await body(c, schemas.changePlanInput);
    const h = await ownedHostel(currentUser(c), c.req.param('id'));
    const r = await changePlan(h, plan);
    return c.json({ hostel: toHostel(r.hostel), invoice: r.invoice ? toSaasInvoice(r.invoice) : null });
  })
  .get('/owner/saas-invoices', async (c) => {
    const rows = await db
      .select()
      .from(schema.saasInvoices)
      .where(eq(schema.saasInvoices.ownerId, currentUser(c).id))
      .orderBy(desc(schema.saasInvoices.createdAt));
    return c.json(rows.map(toSaasInvoice));
  })

  // ---- rooms ----
  .post('/owner/hostels/:id/rooms', async (c) => {
    const input = await body(c, schemas.roomTypeInput);
    return c.json(toRoomType(await listings.addRoom(currentUser(c), c.req.param('id'), input)), 201);
  })
  .patch('/owner/rooms/:id', async (c) => {
    const input = await body(c, schemas.roomTypeUpdateInput);
    return c.json(toRoomType(await listings.updateRoom(currentUser(c), c.req.param('id'), input)));
  })
  .delete('/owner/rooms/:id', async (c) => {
    await listings.deleteRoom(currentUser(c), c.req.param('id'));
    return c.json({ ok: true as const });
  })

  // ---- photos ----
  .post('/owner/hostels/:id/photos', async (c) => {
    const input = await body(c, schemas.addPhotoInput);
    return c.json(toPhoto(await listings.addPhoto(currentUser(c), c.req.param('id'), input)), 201);
  })
  .delete('/owner/photos/:id', async (c) => {
    await listings.deletePhoto(currentUser(c), c.req.param('id'));
    return c.json({ ok: true as const });
  })
  .put('/owner/hostels/:id/photos/order', async (c) => {
    const { photoIds } = await body(c, schemas.reorderPhotosInput);
    return c.json((await listings.reorderPhotos(currentUser(c), c.req.param('id'), photoIds)).map(toPhoto));
  })

  // ---- visits ----
  .get('/owner/visits', async (c) => {
    const hostelId = c.req.query('hostelId') || undefined;
    if (hostelId) await ownedHostel(currentUser(c), hostelId);
    return c.json(await ownerVisits(currentUser(c), hostelId));
  })
  .patch('/owner/visits/:id', async (c) => {
    const { status } = await body(c, schemas.visitStatusInput);
    const [v] = await db.select().from(schema.visitRequests).where(eq(schema.visitRequests.id, c.req.param('id')));
    if (!v) throw err.notFound('Visit request');
    await ownedHostel(currentUser(c), v.hostelId).catch(() => {
      throw err.notFound('Visit request');
    });
    const [u] = await db.update(schema.visitRequests).set({ status }).where(eq(schema.visitRequests.id, v.id)).returning();
    return c.json(toVisit(u!));
  })

  // ---- food ----
  .get('/owner/hostels/:id/menu', async (c) => {
    const h = await ownedHostel(currentUser(c), c.req.param('id'));
    return c.json(await getMenuWeek(h.id, parseWeek(c.req.query('week'))));
  })
  .put('/owner/hostels/:id/menu', async (c) => {
    const h = await ownedHostel(currentUser(c), c.req.param('id'));
    requireVerified(h);
    const week = parseWeek(c.req.query('week'));
    const input = await body(c, schemas.menuWeekInput);
    return c.json(await saveMenu(h, week, input));
  })
  .post('/owner/hostels/:id/menu/copy-last', async (c) => {
    const h = await ownedHostel(currentUser(c), c.req.param('id'));
    requireVerified(h);
    return c.json(await copyLastWeek(h, parseWeek(c.req.query('week'))));
  })
  .get('/owner/hostels/:id/headcount', async (c) => {
    const h = await ownedHostel(currentUser(c), c.req.param('id'));
    requireVerified(h);
    const date = c.req.query('date') || istDate();
    if (!isIsoDate(date)) throw err.validation('date must be YYYY-MM-DD', [{ path: 'date', message: 'Invalid date' }]);
    return c.json(await headcount(h.id, date));
  })
  .get('/owner/hostels/:id/subscribers', async (c) => {
    const h = await ownedHostel(currentUser(c), c.req.param('id'));
    return c.json(await hostelSubscribers(h));
  })
  .get('/owner/payouts', async (c) => c.json((await listPayouts({ ownerId: currentUser(c).id })).map(toPayout)))

  // ---- residents ----
  .get('/owner/hostels/:id/residents', async (c) => c.json(await ownerResidents(currentUser(c), c.req.param('id'))))
  .post('/owner/hostels/:id/residents', async (c) => {
    const input = await body(c, schemas.ownerAddResidentInput);
    return c.json(await addResident(currentUser(c), c.req.param('id'), input), 201);
  })
  .patch('/owner/residencies/:id', async (c) => {
    const input = await body(c, schemas.residencyDecisionInput);
    return c.json(toResidency(await decideResidency(currentUser(c), c.req.param('id'), input)));
  })
  .get('/owner/residencies/:id/rent', async (c) => c.json((await rentLedger(currentUser(c), c.req.param('id'))).map(toRentPayment)))
  .post('/owner/residencies/:id/rent', async (c) => {
    const input = await body(c, schemas.rentPaymentInput);
    return c.json(toRentPayment(await recordRent(currentUser(c), c.req.param('id'), input)), 201);
  })

  // ---- issues, reviews, announcements ----
  .get('/owner/hostels/:id/issues', async (c) => {
    const user = currentUser(c);
    const h = await ownedHostel(user, c.req.param('id'));
    return c.json(await listOwnerIssues(user, h.id, query(c, schemas.issueListQuery)));
  })
  .get('/owner/hostels/:id/reviews', async (c) => {
    const h = await ownedHostel(currentUser(c), c.req.param('id'));
    return c.json(await hostelReviewsForOwner(h.id));
  })
  .post('/owner/reviews/:id/reply', async (c) => {
    const { reply } = await body(c, schemas.reviewReplyInput);
    const user = currentUser(c);
    return c.json(await replyToReview(c.req.param('id'), reply, (hostelId) => ownedHostel(user, hostelId)));
  })
  .post('/owner/hostels/:id/announcements', async (c) => {
    const user = currentUser(c);
    const h = await ownedHostel(user, c.req.param('id'));
    requirePro(h);
    const { body: text } = await body(c, schemas.postInput);
    return c.json(await createPost(user, h, text, 'announcement'), 201);
  })
  .post('/owner/posts/:id/pin', async (c) => {
    const user = currentUser(c);
    return c.json(await togglePin(user, c.req.param('id'), (hostelId) => ownedHostel(user, hostelId)));
  });

