import {
  foodPartnerInputSchema,
  foodPartnerUpdateSchema,
  HOSTEL_STATUSES,
  monthSchema,
  newId,
  PARTNER_STATUSES,
  payoutGenerateSchema,
  reasonSchema,
  rejectSchema,
  SUBSCRIPTION_STATUSES,
  verifyPartnerSchema,
} from '@hostels/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { notFound } from '../lib/errors';
import { parseBody, parseQuery } from '../lib/validate';
import { type AppEnv, requireAuth } from '../middleware/auth';
import { adminSubscriptions, overdueInvoices } from '../services/billing';
import { openReports } from '../services/community';
import { listFoodPartners } from '../services/food';
import { runJobs } from '../services/jobs';
import { decidePartner, hostelDetail, reviewListing, setPlatformFee } from '../services/listings';
import { toHostel } from '../services/mappers';
import { adminMoves } from '../services/moves';
import { generatePayouts, listPayouts, markPayoutPaid } from '../services/payouts';
import { toOwnerInvoice } from '../services/plans';
import { flaggedReviews, moderateReview } from '../services/residents';

export const adminRoutes = new Hono<AppEnv>()
  .use('/admin/*', requireAuth('admin'))
  .get('/admin/stats', async (c) => {
    const db = getDb();
    const count = async (q: Promise<{ n: number }[]>) => (await q)[0]!.n;
    const n = sql<number>`count(*)::int`;
    return c.json({
      listingsPending: await count(db.select({ n }).from(schema.hostels).where(eq(schema.hostels.status, 'pending'))),
      partnersApplied: await count(db.select({ n }).from(schema.hostels).where(eq(schema.hostels.partnerStatus, 'applied'))),
      liveHostels: await count(db.select({ n }).from(schema.hostels).where(eq(schema.hostels.status, 'live'))),
      activeSubscriptions: await count(db.select({ n }).from(schema.subscriptions).where(eq(schema.subscriptions.status, 'active'))),
      flaggedReviews: (await flaggedReviews()).length,
      openReports: (await openReports()).length,
      overdueBills: (await overdueInvoices()).length,
    });
  })
  .get('/admin/hostels', async (c) => {
    const { status, partnerStatus } = parseQuery(
      c,
      z.object({ status: z.enum(HOSTEL_STATUSES).optional(), partnerStatus: z.enum(PARTNER_STATUSES).optional() }),
    );
    const rows = await getDb()
      .select()
      .from(schema.hostels)
      .where(
        and(
          status ? eq(schema.hostels.status, status) : undefined,
          partnerStatus ? eq(schema.hostels.partnerStatus, partnerStatus) : undefined,
        ),
      )
      .orderBy(asc(schema.hostels.createdAt));
    return c.json(rows.map(toHostel));
  })
  .get('/admin/hostels/:id', async (c) => {
    const [h] = await getDb().select().from(schema.hostels).where(eq(schema.hostels.id, c.req.param('id')));
    if (!h) throw notFound('Hostel');
    return c.json(await hostelDetail(h));
  })
  .post('/admin/hostels/:id/approve', async (c) => c.json(await reviewListing(c.req.param('id'), { approve: true })))
  .post('/admin/hostels/:id/reject', async (c) => {
    const { reason } = await parseBody(c, rejectSchema);
    return c.json(await reviewListing(c.req.param('id'), { approve: false, reason }));
  })
  .post('/admin/hostels/:id/partner/verify', async (c) => {
    const { platformFeePct } = await parseBody(c, verifyPartnerSchema);
    return c.json(await decidePartner(c.req.param('id'), { verify: true, platformFeePct }));
  })
  .post('/admin/hostels/:id/partner/reject', async (c) => {
    const { reason } = await parseBody(c, rejectSchema);
    return c.json(await decidePartner(c.req.param('id'), { verify: false, reason }));
  })
  .patch('/admin/hostels/:id/fee', async (c) => {
    const { platformFeePct } = await parseBody(c, verifyPartnerSchema);
    return c.json(await setPlatformFee(c.req.param('id'), platformFeePct));
  })

  // Food partners.
  .get('/admin/food-partners', async (c) => c.json(await listFoodPartners()))
  .post('/admin/food-partners', async (c) => {
    const input = await parseBody(c, foodPartnerInputSchema);
    const [row] = await getDb()
      .insert(schema.foodPartners)
      .values({ ...input, logoUrl: input.logoUrl ?? null, id: newId('fdp') })
      .returning();
    return c.json(row, 201);
  })
  .patch('/admin/food-partners/:id', async (c) => {
    const patch = await parseBody(c, foodPartnerUpdateSchema);
    const [row] = await getDb().update(schema.foodPartners).set(patch).where(eq(schema.foodPartners.id, c.req.param('id'))).returning();
    if (!row) throw notFound('Food partner');
    return c.json(row);
  })

  // Subscriptions, moves, bills.
  .get('/admin/subscriptions', async (c) => {
    const { status } = parseQuery(c, z.object({ status: z.enum(SUBSCRIPTION_STATUSES).optional() }));
    return c.json(await adminSubscriptions(status));
  })
  .get('/admin/moves', async (c) => c.json(await adminMoves()))
  .get('/admin/invoices/overdue', async (c) => c.json(await overdueInvoices()))
  .get('/admin/owner-invoices', async (c) => {
    const rows = await getDb()
      .select({ invoice: schema.ownerInvoices, hostelName: schema.hostels.name })
      .from(schema.ownerInvoices)
      .innerJoin(schema.hostels, eq(schema.hostels.id, schema.ownerInvoices.hostelId))
      .orderBy(desc(schema.ownerInvoices.periodStart));
    return c.json(rows.map((r) => ({ ...toOwnerInvoice(r.invoice), hostelName: r.hostelName })));
  })

  // Payouts.
  .get('/admin/payouts', async (c) => {
    const { month } = parseQuery(c, z.object({ month: monthSchema.optional() }));
    return c.json(await listPayouts({ month }));
  })
  .post('/admin/payouts/generate', async (c) => {
    const { month } = await parseBody(c, payoutGenerateSchema);
    return c.json(await generatePayouts(month));
  })
  .post('/admin/payouts/:id/paid', async (c) => c.json(await markPayoutPaid(c.req.param('id'))))

  // Moderation.
  .get('/admin/reviews/flagged', async (c) => c.json(await flaggedReviews()))
  .post('/admin/reviews/:id/hide', async (c) => {
    const { reason } = await parseBody(c, reasonSchema);
    return c.json(await moderateReview(c.req.param('id'), true, reason));
  })
  .post('/admin/reviews/:id/unhide', async (c) => c.json(await moderateReview(c.req.param('id'), false)))
  .get('/admin/reports', async (c) => c.json(await openReports()))

  // Runs the background jobs now (handy in dev and for the admin "run jobs" button).
  .post('/admin/jobs/run', async (c) => c.json(await runJobs()));
