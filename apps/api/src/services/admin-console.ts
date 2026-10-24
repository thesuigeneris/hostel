/** Admin console: overview, listing and partner review, food partners, subscriptions, invoices. */
import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import {
  foodPrice,
  isOverdue,
  istDate,
  newId,
  OWNER_PLAN_PRICING,
  type AdminOverview,
  type HostelStatus,
  type OwnerPlan,
  type PartnerStatus,
  type schemas,
  type SubscriptionStatus,
} from '@hostels/shared';
import type { z } from 'zod';
import { db, schema } from '../db';
import { err, pageParams } from '../lib/http';
import { subscriptionRows } from './owner-dashboard';

async function n(table: Parameters<ReturnType<typeof db.select>['from']>[0], where?: SQL) {
  const [r] = await db.select({ n: count() }).from(table).where(where);
  return r!.n;
}

export async function overview(now = new Date()): Promise<AdminOverview> {
  const h = schema.hostels;
  const [pendingListings, partnerApplications, liveHostels, verifiedPartners, proHostels, activeSubscriptions, scheduledMoves] = await Promise.all([
    n(h, eq(h.status, 'pending')),
    n(h, eq(h.partnerStatus, 'applied')),
    n(h, eq(h.status, 'live')),
    n(h, eq(h.partnerStatus, 'verified')),
    n(h, eq(h.ownerPlan, 'pro')),
    n(schema.subscriptions, eq(schema.subscriptions.status, 'active')),
    n(schema.moveRequests, eq(schema.moveRequests.status, 'scheduled')),
  ]);
  const dueInvoices = await db.select({ dueDate: schema.invoices.dueDate }).from(schema.invoices).where(eq(schema.invoices.status, 'due'));
  const today = istDate(now);
  const active = await db
    .select({ plan: schema.subscriptions.mealPlan, rent: schema.roomTypes.monthlyRent })
    .from(schema.subscriptions)
    .innerJoin(schema.roomTypes, eq(schema.roomTypes.id, schema.subscriptions.roomTypeId))
    .where(eq(schema.subscriptions.status, 'active'));
  const openIssues = await n(schema.issues, inArray(schema.issues.status, ['open', 'acknowledged', 'in_progress']));
  return {
    pendingListings,
    partnerApplications,
    liveHostels,
    verifiedPartners,
    proHostels,
    activeSubscriptions,
    overdueInvoices: dueInvoices.filter((d) => isOverdue(d.dueDate, today)).length,
    openIssues,
    scheduledMoves,
    mrr: {
      subscriptions: active.reduce((a, s) => a + s.rent + foodPrice(s.plan), 0),
      saas: proHostels * OWNER_PLAN_PRICING.pro.price,
    },
  };
}

export async function listHostels(q: { status?: HostelStatus; partnerStatus?: PartnerStatus; ownerPlan?: OwnerPlan; q?: string; page?: number }) {
  const h = schema.hostels;
  const pg = pageParams(q.page);
  const where = and(
    q.status ? eq(h.status, q.status) : undefined,
    q.partnerStatus ? eq(h.partnerStatus, q.partnerStatus) : undefined,
    q.ownerPlan ? eq(h.ownerPlan, q.ownerPlan) : undefined,
    q.q ? or(ilike(h.name, `%${q.q}%`), ilike(h.area, `%${q.q}%`)) : undefined,
  );
  const [total, rows] = await Promise.all([n(h, where), db.select().from(h).where(where).orderBy(desc(h.createdAt)).limit(pg.pageSize).offset(pg.offset)]);
  return { rows, total, page: pg.page, pageSize: pg.pageSize };
}

async function hostelOr404(id: string) {
  const [h] = await db.select().from(schema.hostels).where(eq(schema.hostels.id, id));
  if (!h) throw err.notFound('Hostel');
  return h;
}

async function setHostel(id: string, patch: Partial<typeof schema.hostels.$inferInsert>) {
  const [u] = await db.update(schema.hostels).set(patch).where(eq(schema.hostels.id, id)).returning();
  return u!;
}

export async function approveListing(id: string) {
  const h = await hostelOr404(id);
  if (h.status !== 'pending') throw err.domain('invalid_transition', `Only listings in review can be approved (this one is ${h.status})`);
  return setHostel(id, { status: 'live', rejectionReason: null });
}

export async function rejectListing(id: string, reason: string) {
  const h = await hostelOr404(id);
  if (h.status !== 'pending' && h.status !== 'live') throw err.domain('invalid_transition', `A ${h.status} listing cannot be rejected`);
  return setHostel(id, { status: 'rejected', rejectionReason: reason });
}

export async function verifyPartner(id: string, platformFeePct: number) {
  const h = await hostelOr404(id);
  if (h.status !== 'live') throw err.domain('invalid_transition', 'Only live listings can become verified partners');
  if (h.partnerStatus === 'verified') return setHostel(id, { platformFeePct });
  return setHostel(id, { partnerStatus: 'verified', platformFeePct, rejectionReason: null });
}

export async function rejectPartner(id: string, reason: string) {
  const h = await hostelOr404(id);
  if (h.partnerStatus !== 'applied') throw err.domain('invalid_transition', 'Only partner applications can be rejected');
  return setHostel(id, { partnerStatus: 'rejected', rejectionReason: reason });
}

// ---------- food partners ----------

export async function listFoodPartners() {
  return db.select().from(schema.foodPartners).orderBy(schema.foodPartners.name);
}

export async function createFoodPartner(input: z.output<typeof schemas.foodPartnerInput>) {
  const [f] = await db
    .insert(schema.foodPartners)
    .values({ id: newId('fdp'), ...input, logoUrl: input.logoUrl ?? null })
    .returning();
  return f!;
}

export async function updateFoodPartner(id: string, input: Partial<z.output<typeof schemas.foodPartnerInput>>) {
  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (Object.keys(patch).length === 0) {
    const [f] = await db.select().from(schema.foodPartners).where(eq(schema.foodPartners.id, id));
    if (!f) throw err.notFound('Food partner');
    return f;
  }
  const [f] = await db.update(schema.foodPartners).set(patch).where(eq(schema.foodPartners.id, id)).returning();
  if (!f) throw err.notFound('Food partner');
  return f;
}

// ---------- subscriptions, moves, invoices ----------

export async function listSubscriptions(q: { status?: SubscriptionStatus; page?: number }) {
  const pg = pageParams(q.page);
  const where = q.status ? eq(schema.subscriptions.status, q.status) : undefined;
  const [total, items] = await Promise.all([n(schema.subscriptions, where), subscriptionRows(where, pg.pageSize, pg.offset)]);
  return { items, total, page: pg.page, pageSize: pg.pageSize };
}

export async function listMoves() {
  return db.select().from(schema.moveRequests).orderBy(desc(schema.moveRequests.createdAt)).limit(200);
}

export async function overdueInvoices(now = new Date()) {
  const today = istDate(now);
  const rows = await db.select().from(schema.invoices).where(eq(schema.invoices.status, 'due')).orderBy(schema.invoices.dueDate);
  return rows.filter((r) => isOverdue(r.dueDate, today));
}

export async function listSaasInvoices() {
  return db.select().from(schema.saasInvoices).orderBy(desc(schema.saasInvoices.createdAt)).limit(500);
}
