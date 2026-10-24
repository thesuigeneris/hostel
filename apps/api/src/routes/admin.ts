import { Hono } from 'hono';
import { HOSTEL_STATUSES, ISSUE_STATUSES, OWNER_PLANS, PARTNER_STATUSES, REVIEW_STATUSES, schemas, SUBSCRIPTION_STATUSES } from '@hostels/shared';
import { z } from 'zod';
import { currentUser, requireRole } from '../lib/auth';
import { body, query } from '../lib/http';
import { toHostel } from '../lib/serialize';
import { toFoodPartner, toInvoiceDto, toMoveDto, toPayout, toSaasInvoice } from '../lib/serialize-community';
import type { AppEnv } from '../lib/types';
import * as console_ from '../services/admin-console';
import { generatePayouts, listPayouts, markPayoutPaid } from '../services/admin-payouts';
import { adminIssues } from '../services/community-issues';
import { adminReviews, moderateReview } from '../services/community-reviews';
import { runAllJobs } from '../services/jobs';

const page = z.coerce.number().int().min(1).optional();
const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();

/** Admin console routes. */
export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('/admin/*', requireRole('admin'));

adminRoutes
  .get('/admin/overview', async (c) => c.json(await console_.overview()))

  // ---- listings & partners ----
  .get('/admin/hostels', async (c) => {
    const q = query(
      c,
      z.object({
        status: z.enum(HOSTEL_STATUSES).optional(),
        partnerStatus: z.enum(PARTNER_STATUSES).optional(),
        ownerPlan: z.enum(OWNER_PLANS).optional(),
        q: z.string().optional(),
        page,
      }),
    );
    const r = await console_.listHostels(q);
    return c.json({ items: r.rows.map(toHostel), total: r.total, page: r.page, pageSize: r.pageSize });
  })
  .post('/admin/hostels/:id/approve', async (c) => c.json(toHostel(await console_.approveListing(c.req.param('id')))))
  .post('/admin/hostels/:id/reject', async (c) => {
    const { reason } = await body(c, schemas.adminRejectInput);
    return c.json(toHostel(await console_.rejectListing(c.req.param('id'), reason)));
  })
  .post('/admin/hostels/:id/verify-partner', async (c) => {
    const { platformFeePct } = await body(c, schemas.adminVerifyPartnerInput);
    return c.json(toHostel(await console_.verifyPartner(c.req.param('id'), platformFeePct)));
  })
  .post('/admin/hostels/:id/reject-partner', async (c) => {
    const { reason } = await body(c, schemas.adminRejectInput);
    return c.json(toHostel(await console_.rejectPartner(c.req.param('id'), reason)));
  })

  // ---- food partners ----
  .get('/admin/food-partners', async (c) => c.json((await console_.listFoodPartners()).map(toFoodPartner)))
  .post('/admin/food-partners', async (c) => {
    const input = await body(c, schemas.foodPartnerInput);
    return c.json(toFoodPartner(await console_.createFoodPartner(input)), 201);
  })
  .patch('/admin/food-partners/:id', async (c) => {
    const input = await body(c, schemas.foodPartnerInput.partial());
    return c.json(toFoodPartner(await console_.updateFoodPartner(c.req.param('id'), input)));
  })

  // ---- subscriptions, moves, invoices ----
  .get('/admin/subscriptions', async (c) => {
    const q = query(c, z.object({ status: z.enum(SUBSCRIPTION_STATUSES).optional(), page }));
    return c.json(await console_.listSubscriptions(q));
  })
  .get('/admin/moves', async (c) => c.json((await console_.listMoves()).map(toMoveDto)))
  .get('/admin/invoices/overdue', async (c) => c.json((await console_.overdueInvoices()).map((i) => toInvoiceDto(i))))
  .get('/admin/saas-invoices', async (c) => c.json((await console_.listSaasInvoices()).map(toSaasInvoice)))

  // ---- payouts ----
  .get('/admin/payouts', async (c) => {
    const { periodMonth } = query(c, z.object({ periodMonth: z.string().regex(/^\d{4}-\d{2}$/).optional() }));
    return c.json((await listPayouts({ periodMonth })).map(toPayout));
  })
  .post('/admin/payouts/generate', async (c) => {
    const { periodMonth } = await body(c, schemas.generatePayoutsInput);
    return c.json((await generatePayouts(periodMonth)).map(toPayout));
  })
  .post('/admin/payouts/:id/mark-paid', async (c) => c.json(toPayout(await markPayoutPaid(c.req.param('id')))))

  // ---- reviews & issues ----
  .get('/admin/reviews', async (c) => {
    const q = query(c, z.object({ status: z.enum(REVIEW_STATUSES).optional(), page }));
    return c.json(await adminReviews(q));
  })
  .patch('/admin/reviews/:id', async (c) => {
    const { status } = await body(c, schemas.reviewModerationInput);
    return c.json(await moderateReview(c.req.param('id'), status));
  })
  .get('/admin/issues', async (c) => {
    const q = query(c, z.object({ status: z.enum(ISSUE_STATUSES).optional(), escalated: bool, page }));
    return c.json(await adminIssues(currentUser(c), q));
  })

  .post('/admin/jobs/run', async (c) => c.json(await runAllJobs()));
