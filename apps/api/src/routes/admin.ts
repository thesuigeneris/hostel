import {
  AUDIT_ACTIONS,
  contentTargetSchema,
  foodPartnerInputSchema,
  foodPartnerUpdateSchema,
  HOSTEL_STATUSES,
  INVOICE_STATUSES,
  moderationSchema,
  monthSchema,
  newId,
  OWNER_PLAN_TIERS,
  ownerInvoiceVoidSchema,
  partnerChecklistSchema,
  partnerRecheckSchema,
  PARTNER_STATUSES,
  PAYMENT_EXCEPTION_STATUSES,
  PAYMENT_MODES,
  paymentRefundSchema,
  partnerVerifySchema,
  payoutGenerateSchema,
  reasonSchema,
  rejectSchema,
  SUBSCRIPTION_STATUSES,
  verifyPartnerSchema,
} from '@hostels/shared';
import { and, asc, eq, gte, ilike, isNotNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { notFound } from '../lib/errors';
import { escapeLike } from '../services/search';
import { parseBody, parseQuery } from '../lib/validate';
import { type AppEnv, requireAuth } from '../middleware/auth';
import { audit, listAudit } from '../services/audit';
import { adminSubscriptions, overdueInvoices } from '../services/billing';
import { escalatedIssues } from '../services/community';
import { listFoodPartners } from '../services/food';
import { runJobs } from '../services/jobs';
import { decidePartner, hostelDetail, reviewListing, setPlatformFee } from '../services/listings';
import { listingChanges, recheckPartner } from '../services/listing-changes';
import { toAdminHostel } from '../services/mappers';
import { flaggedQueue, hiddenContent, hiddenReviews, keepReview, moderateContent, reportQueue } from '../services/moderation';
import { adminRevenue, platformRevenue } from '../services/money';
import { adminMoves } from '../services/moves';
import { generatePayouts, listPayouts, markPayoutPaid } from '../services/payouts';
import { adminApplications, saveChecklist } from '../services/partners';
import { adminOwnerInvoices, adminOwnerPlans, voidOwnerInvoice } from '../services/plans';
import { countRefundsDue, listPaymentExceptions, markRefunded } from '../services/refunds';
import { moderateReview } from '../services/residents';

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
      flaggedReviews: (await flaggedQueue()).length,
      openReports: (await reportQueue()).length,
      overdueBills: (await overdueInvoices()).length,
      escalatedIssues: (await escalatedIssues(c.get('user'))).length,
      refundsDue: await countRefundsDue(),
      revenue: await adminRevenue(),
      overdueOwnerBills: (await adminOwnerInvoices({ overdue: true })).length,
      suspendedHostels: await count(db.select({ n }).from(schema.ownerPlans).where(eq(schema.ownerPlans.suspended, true))),
      listingChanges7d: await count(
        db.select({ n }).from(schema.listingChanges).where(gte(schema.listingChanges.createdAt, new Date(clock.now().getTime() - 7 * 86_400_000))),
      ),
      partnerRechecks: await count(db.select({ n }).from(schema.hostels).where(isNotNull(schema.hostels.partnerRecheckSince))),
    });
  })
  .get('/admin/hostels', async (c) => {
    const { status, partnerStatus, q, recheck, limit, offset } = parseQuery(
      c,
      z.object({
        status: z.enum(HOSTEL_STATUSES).optional(),
        partnerStatus: z.enum(PARTNER_STATUSES).optional(),
        q: z.string().trim().max(80).optional(),
        recheck: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
      }),
    );
    const h = schema.hostels;
    const like = q ? `%${escapeLike(q)}%` : '';
    const rows = await getDb()
      .select()
      .from(schema.hostels)
      .where(
        and(
          status ? eq(schema.hostels.status, status) : undefined,
          partnerStatus ? eq(schema.hostels.partnerStatus, partnerStatus) : undefined,
          recheck ? isNotNull(h.partnerRecheckSince) : undefined,
          q ? or(ilike(h.name, like), ilike(h.area, like), ilike(h.slug, like), ilike(h.contactPhone, like)) : undefined,
        ),
      )
      // Oldest first, so the queue is worked in the order owners submitted; id breaks ties for stable pages.
      .orderBy(asc(schema.hostels.createdAt), asc(schema.hostels.id))
      .limit(limit)
      .offset(offset);
    return c.json(rows.map(toAdminHostel));
  })
  .get('/admin/hostels/:id', async (c) => {
    const [h] = await getDb().select().from(schema.hostels).where(eq(schema.hostels.id, c.req.param('id')));
    if (!h) throw notFound('Hostel');
    return c.json(await hostelDetail(h));
  })
  .post('/admin/hostels/:id/approve', async (c) => {
    const row = await reviewListing(c.req.param('id'), { approve: true });
    await audit(c.get('user').id, 'listing.approve', { type: 'hostel', id: row.id }, `Approved ${row.name}`);
    return c.json(row);
  })
  .post('/admin/hostels/:id/reject', async (c) => {
    const { reason } = await parseBody(c, rejectSchema);
    const row = await reviewListing(c.req.param('id'), { approve: false, reason });
    await audit(c.get('user').id, 'listing.reject', { type: 'hostel', id: row.id }, `Rejected ${row.name}: ${reason}`);
    return c.json(row);
  })

  // Partner applications: the in-person checklist, then verify or decline.
  .get('/admin/partner-applications', async (c) => {
    const { status } = parseQuery(c, z.object({ status: z.enum(['applied', 'verified', 'rejected']).optional() }));
    return c.json(await adminApplications(status));
  })
  .put('/admin/hostels/:id/partner/checklist', async (c) => {
    const input = await parseBody(c, partnerChecklistSchema);
    const app = await saveChecklist(c.req.param('id'), input);
    await audit(c.get('user').id, 'partner.checklist', { type: 'hostel', id: app.hostelId }, `${app.checklist.length} standards ticked`);
    return c.json(app);
  })
  .post('/admin/hostels/:id/partner/verify', async (c) => {
    const { platformFeePct, checklist, note } = await parseBody(c, partnerVerifySchema);
    const row = await decidePartner(c.req.param('id'), { verify: true, platformFeePct, checklist, note }, c.get('user').id);
    await audit(c.get('user').id, 'partner.verify', { type: 'hostel', id: row.id }, `Verified ${row.name} at ${platformFeePct}% fee`);
    return c.json(row);
  })
  .post('/admin/hostels/:id/partner/reject', async (c) => {
    const { reason } = await parseBody(c, rejectSchema);
    const row = await decidePartner(c.req.param('id'), { verify: false, reason }, c.get('user').id);
    await audit(c.get('user').id, 'partner.reject', { type: 'hostel', id: row.id }, `Declined ${row.name}: ${reason}`);
    return c.json(row);
  })
  // Material edits of live listings (edge case O3), and the in-person check of a partner that moved.
  .get('/admin/listing-changes', async (c) => {
    const filter = parseQuery(
      c,
      z.object({
        recheck: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
        hostelId: z.string().max(64).optional(),
        before: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
    );
    return c.json(await listingChanges(filter));
  })
  .post('/admin/hostels/:id/partner/recheck', async (c) => {
    const input = await parseBody(c, partnerRecheckSchema);
    const row = await recheckPartner(c.req.param('id'), input, c.get('user').id);
    await audit(c.get('user').id, 'partner.recheck', { type: 'hostel', id: row.id }, `Checked ${row.name} again after it moved: ${input.note}`);
    return c.json(toAdminHostel(row));
  })
  .patch('/admin/hostels/:id/fee', async (c) => {
    const { platformFeePct } = await parseBody(c, verifyPartnerSchema);
    const row = await setPlatformFee(c.req.param('id'), platformFeePct);
    await audit(c.get('user').id, 'partner.fee', { type: 'hostel', id: row.id }, `${row.name} fee set to ${platformFeePct}%`);
    return c.json(row);
  })

  // Food partners.
  .get('/admin/food-partners', async (c) => c.json(await listFoodPartners()))
  .post('/admin/food-partners', async (c) => {
    const input = await parseBody(c, foodPartnerInputSchema);
    const [row] = await getDb()
      .insert(schema.foodPartners)
      .values({ ...input, logoUrl: input.logoUrl ?? null, id: newId('fdp') })
      .returning();
    await audit(c.get('user').id, 'food_partner.add', { type: 'food_partner', id: row!.id }, `Added ${row!.name}`);
    return c.json(row, 201);
  })
  .patch('/admin/food-partners/:id', async (c) => {
    const patch = await parseBody(c, foodPartnerUpdateSchema);
    const [row] = await getDb().update(schema.foodPartners).set(patch).where(eq(schema.foodPartners.id, c.req.param('id'))).returning();
    if (!row) throw notFound('Food partner');
    await audit(c.get('user').id, 'food_partner.update', { type: 'food_partner', id: row.id }, `Updated ${row.name}${patch.active === false ? ' (deactivated)' : patch.active ? ' (activated)' : ''}`);
    return c.json(row);
  })

  // Subscriptions, moves, bills.
  .get('/admin/subscriptions', async (c) => {
    const { status } = parseQuery(c, z.object({ status: z.enum(SUBSCRIPTION_STATUSES).optional() }));
    return c.json(await adminSubscriptions(status));
  })
  .get('/admin/moves', async (c) => c.json(await adminMoves()))
  .get('/admin/invoices/overdue', async (c) => c.json(await overdueInvoices()))

  // Owner plans and platform bills.
  .get('/admin/owner-plans', async (c) => {
    const { plan, suspended, q } = parseQuery(
      c,
      z.object({
        plan: z.enum(OWNER_PLAN_TIERS).optional(),
        suspended: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
        q: z.string().trim().max(80).optional(),
      }),
    );
    return c.json(await adminOwnerPlans({ plan, suspended, q }));
  })
  .get('/admin/owner-invoices', async (c) => {
    const { status, mode, overdue, q } = parseQuery(
      c,
      z.object({
        status: z.enum(INVOICE_STATUSES).optional(),
        mode: z.enum(PAYMENT_MODES).optional(),
        overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
        q: z.string().trim().max(80).optional(),
      }),
    );
    return c.json(await adminOwnerInvoices({ status, mode, overdue, q }));
  })
  .post('/admin/owner-invoices/:id/void', async (c) => {
    const { reason } = await parseBody(c, ownerInvoiceVoidSchema);
    const bill = await voidOwnerInvoice(c.req.param('id'));
    await audit(c.get('user').id, 'owner_invoice.void', { type: 'owner_invoice', id: bill.id }, `Waived ₹${bill.amount} (${bill.periodStart}): ${reason}`);
    return c.json(bill);
  })

  // Payments that arrived for bills that could no longer take them: refunds owed.
  .get('/admin/payment-exceptions', async (c) => {
    const { status } = parseQuery(c, z.object({ status: z.enum(PAYMENT_EXCEPTION_STATUSES).optional() }));
    return c.json(await listPaymentExceptions(status));
  })
  .post('/admin/payment-exceptions/:id/refunded', async (c) => {
    const { note } = await parseBody(c, paymentRefundSchema);
    const row = await markRefunded(c.req.param('id'), c.get('user').id, note);
    await audit(c.get('user').id, 'payment.refunded', { type: 'payment_exception', id: row.id }, `Refunded ₹${row.amount} (${row.razorpayPaymentId}): ${note}`);
    return c.json(row);
  })

  // Money received in a month, real money only, with what was left out.
  .get('/admin/revenue', async (c) => {
    const { month } = parseQuery(c, z.object({ month: monthSchema.optional() }));
    return c.json(await platformRevenue(month ?? clock.today().slice(0, 7)));
  })

  // Payouts.
  .get('/admin/payouts', async (c) => {
    const { month } = parseQuery(c, z.object({ month: monthSchema.optional() }));
    return c.json(await listPayouts({ month }));
  })
  .post('/admin/payouts/generate', async (c) => {
    const { month } = await parseBody(c, payoutGenerateSchema);
    const rows = await generatePayouts(month);
    await audit(c.get('user').id, 'payouts.generate', { type: 'month', id: month }, `${rows.length} payouts for ${month}`);
    return c.json(rows);
  })
  .post('/admin/payouts/:id/paid', async (c) => {
    const row = await markPayoutPaid(c.req.param('id'));
    await audit(c.get('user').id, 'payout.paid', { type: 'payout', id: c.req.param('id') }, 'Marked paid');
    return c.json(row);
  })

  // Moderation. Every decision resolves the open flags or reports and is audited with its reason.
  .get('/admin/reviews/flagged', async (c) => c.json(await flaggedQueue()))
  .get('/admin/reviews/hidden', async (c) => c.json(await hiddenReviews()))
  .post('/admin/reviews/:id/keep', async (c) => {
    const { reason } = await parseBody(c, moderationSchema);
    const row = await keepReview(c.req.param('id'));
    await audit(c.get('user').id, 'review.keep', { type: 'review', id: row.id }, `Kept (${row.dismissed} flags dismissed): ${reason}`);
    return c.json(row);
  })
  .post('/admin/reviews/:id/hide', async (c) => {
    const { reason } = await parseBody(c, reasonSchema);
    const row = await moderateReview(c.req.param('id'), true, reason);
    await audit(c.get('user').id, 'review.hide', { type: 'review', id: c.req.param('id') }, `Hidden: ${reason}`);
    return c.json(row);
  })
  .post('/admin/reviews/:id/unhide', async (c) => {
    const row = await moderateReview(c.req.param('id'), false);
    await audit(c.get('user').id, 'review.unhide', { type: 'review', id: c.req.param('id') }, 'Shown again');
    return c.json(row);
  })
  .get('/admin/issues/escalated', async (c) => c.json(await escalatedIssues(c.get('user'))))
  .get('/admin/reports', async (c) => c.json(await reportQueue()))
  .get('/admin/content/hidden', async (c) => c.json(await hiddenContent()))
  .post('/admin/content/:type/:id/:action{hide|unhide|keep}', async (c) => {
    const type = contentTargetSchema.parse(c.req.param('type'));
    const action = c.req.param('action') as 'hide' | 'unhide' | 'keep';
    // Hiding and keeping say why; showing again is the undo.
    const { reason } = action === 'unhide' ? { reason: '' } : await parseBody(c, moderationSchema);
    const row = await moderateContent({ type, id: c.req.param('id') }, action);
    const what = type === 'post' ? 'Post' : 'Comment';
    const summary = action === 'hide' ? `${what} hidden: ${reason}` : action === 'keep' ? `${what} kept (${row.resolved} reports dismissed): ${reason}` : `${what} shown again`;
    await audit(c.get('user').id, `content.${action}`, { type, id: c.req.param('id') }, summary);
    return c.json(row);
  })

  // Runs the background jobs now (handy in dev and for the admin "run jobs" button).
  .post('/admin/jobs/run', async (c) => {
    const result = await runJobs();
    const changed = Object.entries(result).filter(([, n]) => n > 0);
    await audit(c.get('user').id, 'jobs.run', { type: 'jobs', id: 'all' }, changed.length ? changed.map(([k, n]) => `${k}=${n}`).join(' ') : 'Nothing to do');
    return c.json(result);
  })

  // Audit log of admin actions.
  .get('/admin/audit', async (c) => {
    const filter = parseQuery(
      c,
      z.object({
        action: z.enum(AUDIT_ACTIONS).optional(),
        targetId: z.string().max(64).optional(),
        q: z.string().trim().max(80).optional(),
        before: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
    );
    return c.json(await listAudit(filter));
  });
