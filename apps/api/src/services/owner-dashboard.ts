/** Owner dashboard, visit inbox and subscriber list. See personas addendum §8. */
import { and, count, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { addDays, isOverdue, istDate, type AdminSubscriptionRow, type OwnerDashboard, type VisitRequestWithPeople } from '@hostels/shared';
import { db, schema } from '../db';
import { hostelRef, personRef, toSaasInvoice, toSubscriptionDto, toVisit } from '../lib/serialize-community';
import type { UserRow } from '../lib/types';
import type { HostelRow } from './owner-access';
import { hostelSummaries } from './owner-hostel-summaries';

function countMap(rows: { hostelId: string; n: number }[]) {
  return new Map(rows.map((r) => [r.hostelId, Number(r.n)]));
}

export async function ownerDashboard(user: UserRow): Promise<OwnerDashboard> {
  const hostels = await db.select().from(schema.hostels).where(eq(schema.hostels.ownerId, user.id)).orderBy(desc(schema.hostels.createdAt));
  const ids = hostels.map((h) => h.id);
  const saas = await db
    .select()
    .from(schema.saasInvoices)
    .where(and(eq(schema.saasInvoices.ownerId, user.id), eq(schema.saasInvoices.status, 'due')))
    .orderBy(desc(schema.saasInvoices.dueDate));
  if (ids.length === 0) return { hostels: [], dueSaasInvoices: saas.map(toSaasInvoice) };

  const since = addDays(istDate(), -29);
  const [summaries, issues, visits, residents, views, rooms] = await Promise.all([
    hostelSummaries(hostels),
    db
      .select({ hostelId: schema.issues.hostelId, n: count() })
      .from(schema.issues)
      .where(and(inArray(schema.issues.hostelId, ids), inArray(schema.issues.status, ['open', 'acknowledged', 'in_progress'])))
      .groupBy(schema.issues.hostelId),
    db
      .select({ hostelId: schema.visitRequests.hostelId, n: count() })
      .from(schema.visitRequests)
      .where(and(inArray(schema.visitRequests.hostelId, ids), eq(schema.visitRequests.status, 'new')))
      .groupBy(schema.visitRequests.hostelId),
    db
      .select({ hostelId: schema.residencies.hostelId, n: count() })
      .from(schema.residencies)
      .where(and(inArray(schema.residencies.hostelId, ids), eq(schema.residencies.status, 'active')))
      .groupBy(schema.residencies.hostelId),
    db
      .select({ hostelId: schema.hostelViews.hostelId, n: sql<number>`sum(${schema.hostelViews.count})`.mapWith(Number) })
      .from(schema.hostelViews)
      .where(and(inArray(schema.hostelViews.hostelId, ids), gte(schema.hostelViews.day, since)))
      .groupBy(schema.hostelViews.hostelId),
    db.select().from(schema.roomTypes).where(inArray(schema.roomTypes.hostelId, ids)),
  ]);
  const [im, vm, rm, wm] = [countMap(issues), countMap(visits), countMap(residents), countMap(views)];
  return {
    hostels: hostels.map((h) => {
      const rs = rooms.filter((r) => r.hostelId === h.id);
      const total = rs.reduce((a, r) => a + r.totalBeds, 0);
      const free = rs.reduce((a, r) => a + r.bedsAvailable, 0);
      const summary = summaries.get(h.id)!;
      return {
        hostel: { ...summary, status: h.status },
        openIssues: im.get(h.id) ?? 0,
        newVisits: vm.get(h.id) ?? 0,
        activeResidents: rm.get(h.id) ?? 0,
        occupancyPct: total ? Math.round((1 - free / total) * 1000) / 10 : 0,
        views30d: wm.get(h.id) ?? 0,
        rating: summary.rating,
      };
    }),
    dueSaasInvoices: saas.map(toSaasInvoice),
  };
}

export async function ownerVisits(user: UserRow, hostelId?: string): Promise<VisitRequestWithPeople[]> {
  const rows = await db
    .select({ v: schema.visitRequests, h: schema.hostels, u: schema.users })
    .from(schema.visitRequests)
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.visitRequests.hostelId))
    .innerJoin(schema.users, eq(schema.users.id, schema.visitRequests.userId))
    .where(and(user.role === 'admin' && hostelId ? undefined : eq(schema.hostels.ownerId, user.id), hostelId ? eq(schema.hostels.id, hostelId) : undefined))
    .orderBy(desc(schema.visitRequests.createdAt));
  return rows.map(({ v, h, u }) => ({ ...toVisit(v), hostel: hostelRef(h), user: personRef(u) }));
}

/** Subscription rows with tenant and hostel, plus how many of their invoices are overdue. */
export async function subscriptionRows(where: SQL | undefined, limit = 200, offset = 0): Promise<AdminSubscriptionRow[]> {
  const rows = await db
    .select({ s: schema.subscriptions, u: schema.users, h: schema.hostels })
    .from(schema.subscriptions)
    .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.subscriptions.hostelId))
    .where(where)
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(limit)
    .offset(offset);
  const subIds = rows.map((r) => r.s.id);
  const due = subIds.length
    ? await db
        .select({ subscriptionId: schema.invoices.subscriptionId, dueDate: schema.invoices.dueDate })
        .from(schema.invoices)
        .where(and(inArray(schema.invoices.subscriptionId, subIds), eq(schema.invoices.status, 'due')))
    : [];
  const today = istDate();
  const overdue = new Map<string, number>();
  for (const d of due) if (isOverdue(d.dueDate, today)) overdue.set(d.subscriptionId, (overdue.get(d.subscriptionId) ?? 0) + 1);
  return rows.map(({ s, u, h }) => ({ ...toSubscriptionDto(s), user: personRef(u), hostel: hostelRef(h), overdueInvoices: overdue.get(s.id) ?? 0 }));
}

export async function hostelSubscribers(hostel: HostelRow): Promise<AdminSubscriptionRow[]> {
  return subscriptionRows(
    and(eq(schema.subscriptions.hostelId, hostel.id), inArray(schema.subscriptions.status, ['pending', 'active', 'cancelled'])),
  );
}
