import type { Invoice, Subscription, User } from '@hostels/shared';
import {
  addDays,
  billingPeriod,
  type BillingPeriod,
  computeBill,
  invoiceGenerationDate,
  isOverdue,
  newId,
  PENDING_SUBSCRIPTION_TTL_MINUTES,
  periodContaining,
  type subscribeSchema,
} from '@hostels/shared';
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb, schema, type Tx } from '../db';
import { clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError, notFound } from '../lib/errors';
import { createOrder } from '../lib/razorpay';
import { isBookable, planFor } from './access';

type SubRow = typeof schema.subscriptions.$inferSelect;
type InvoiceRow = typeof schema.invoices.$inferSelect;

export function toSubscription(r: SubRow): Subscription {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

export function toInvoice(r: InvoiceRow): Invoice {
  const { createdAt: _created, ...rest } = r;
  return { ...rest, paidAt: r.paidAt?.toISOString() ?? null, isOverdue: isOverdue(r, clock.now()) };
}

// --- beds ------------------------------------------------------------------

/** Takes one bed if any is free. Returns false when the room is full; never overbooks. */
export async function reserveBed(tx: Tx, roomTypeId: string): Promise<boolean> {
  const rows = await tx
    .update(schema.roomTypes)
    .set({ bedsAvailable: sql`${schema.roomTypes.bedsAvailable} - 1`, bedsUpdatedAt: clock.now() })
    .where(and(eq(schema.roomTypes.id, roomTypeId), gt(schema.roomTypes.bedsAvailable, 0)))
    .returning({ id: schema.roomTypes.id });
  return rows.length === 1;
}

export async function releaseBed(tx: Tx, roomTypeId: string) {
  await tx
    .update(schema.roomTypes)
    .set({ bedsAvailable: sql`least(${schema.roomTypes.totalBeds}, ${schema.roomTypes.bedsAvailable} + 1)`, bedsUpdatedAt: clock.now() })
    .where(eq(schema.roomTypes.id, roomTypeId));
}

// --- invoices --------------------------------------------------------------

/** The hostel and room a subscription will be in on a date, counting a scheduled move. */
async function placeOn(tx: Tx, sub: SubRow, date: string) {
  const [move] = await tx
    .select()
    .from(schema.moveRequests)
    .where(
      and(
        eq(schema.moveRequests.subscriptionId, sub.id),
        eq(schema.moveRequests.status, 'scheduled'),
        lte(schema.moveRequests.moveDate, date),
      ),
    )
    .limit(1);
  return move ? { hostelId: move.toHostelId, roomTypeId: move.toRoomTypeId } : { hostelId: sub.hostelId, roomTypeId: sub.roomTypeId };
}

/** Skip credits that belong on the bill for period n (n ≥ 1): skips dated from the previous bill's generation day up to the day before this one's. */
export function creditWindow(startDate: string, n: number) {
  const from = n === 1 ? startDate : invoiceGenerationDate(billingPeriod(startDate, n - 1).start);
  const to = addDays(invoiceGenerationDate(billingPeriod(startDate, n).start), -1);
  return { from, to };
}

async function skipCredits(tx: Tx, subscriptionId: string, from: string, to: string) {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${schema.mealSkips.creditAmount}), 0)::int` })
    .from(schema.mealSkips)
    .where(
      and(eq(schema.mealSkips.subscriptionId, subscriptionId), gte(schema.mealSkips.date, from), lte(schema.mealSkips.date, to)),
    );
  return row!.total;
}

/** Creates the bill for a period unless a live one exists. Returns the new row, or null. */
export async function createInvoiceForPeriod(tx: Tx, sub: SubRow, period: BillingPeriod): Promise<InvoiceRow | null> {
  const place = await placeOn(tx, sub, period.start);
  const [room] = await tx.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, place.roomTypeId));
  if (!room) throw new Error(`room ${place.roomTypeId} missing`);
  const credits = period.index === 0 ? 0 : await (async () => {
    const w = creditWindow(sub.startDate, period.index);
    return skipCredits(tx, sub.id, w.from, w.to);
  })();
  const bill = computeBill({ rent: room.monthlyRent, mealPlan: sub.mealPlan, skipCredits: credits });
  const rows = await tx
    .insert(schema.invoices)
    .values({
      id: newId('inv'),
      subscriptionId: sub.id,
      userId: sub.userId,
      hostelId: place.hostelId,
      periodStart: period.start,
      periodEnd: period.end,
      ...bill,
      dueDate: period.start,
    })
    .onConflictDoNothing()
    .returning();
  return rows[0] ?? null;
}

/** Voids unpaid bills from a date on and generates them again (after a move changes the room). */
export async function regenerateUnpaidFrom(tx: Tx, sub: SubRow, fromDate: string) {
  const voided = await tx
    .update(schema.invoices)
    .set({ status: 'void' })
    .where(
      and(
        eq(schema.invoices.subscriptionId, sub.id),
        eq(schema.invoices.status, 'due'),
        gte(schema.invoices.periodStart, fromDate),
      ),
    )
    .returning();
  for (const v of voided) {
    const period = periodContaining(sub.startDate, v.periodStart);
    await createInvoiceForPeriod(tx, sub, period);
  }
  return voided.length;
}

// --- subscribe -------------------------------------------------------------

export async function subscribe(user: User, hostelId: string, input: z.output<typeof subscribeSchema>) {
  const db = getDb();
  const today = clock.today();
  try {
    return await db.transaction(async (tx) => {
      const [hostel] = await tx.select().from(schema.hostels).where(eq(schema.hostels.id, hostelId));
      if (!hostel || hostel.status !== 'live') throw notFound('Hostel');
      if (!isBookable(hostel, await planFor(hostel.id, tx))) {
        throw new AppError('not_verified', 'Only verified partner hostels take subscriptions');
      }
      const [room] = await tx
        .select()
        .from(schema.roomTypes)
        .where(and(eq(schema.roomTypes.id, input.roomTypeId), eq(schema.roomTypes.hostelId, hostel.id)));
      if (!room) throw notFound('Room type');
      if (input.mealPlan !== 'none' && !hostel.foodAvailable) {
        throw new AppError('validation', 'This hostel does not serve food; pick the no-food plan', 400);
      }

      const [open] = await tx
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(and(eq(schema.subscriptions.userId, user.id), inArray(schema.subscriptions.status, ['pending', 'active'])));
      if (open) throw new AppError('already_subscribed', 'You already have a plan. Move or cancel it first.');

      if (!(await reserveBed(tx, room.id))) throw new AppError('no_beds_available', 'No beds left in this room type');

      const [sub] = await tx
        .insert(schema.subscriptions)
        .values({
          id: newId('sub'),
          userId: user.id,
          hostelId: hostel.id,
          roomTypeId: room.id,
          mealPlan: input.mealPlan,
          diet: input.diet,
          status: 'pending',
          startDate: today,
          createdAt: clock.now(),
        })
        .returning();
      const invoice = await createInvoiceForPeriod(tx, sub!, billingPeriod(today, 0));
      const order = await createOrder({
        amountInPaise: invoice!.totalAmount * 100,
        receipt: invoice!.id,
        notes: { invoiceId: invoice!.id, subscriptionId: sub!.id },
      });
      const [withOrder] = await tx
        .update(schema.invoices)
        .set({ razorpayOrderId: order.id })
        .where(eq(schema.invoices.id, invoice!.id))
        .returning();
      return { subscription: toSubscription(sub!), invoice: toInvoice(withOrder!) };
    });
  } catch (e) {
    if (isUniqueViolation(e, 'subscriptions_one_open_per_user')) {
      throw new AppError('already_subscribed', 'You already have a plan. Move or cancel it first.');
    }
    throw e;
  }
}

/** Runs when a bill is paid: a pending subscription becomes active and its residency starts. */
export async function activateIfPending(tx: Tx, subscriptionId: string) {
  const [sub] = await tx
    .update(schema.subscriptions)
    .set({ status: 'active' })
    .where(and(eq(schema.subscriptions.id, subscriptionId), eq(schema.subscriptions.status, 'pending')))
    .returning();
  if (!sub) return null;
  const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, sub.userId));
  await tx.insert(schema.residencies).values({
    id: newId('res'),
    userId: sub.userId,
    phone: user!.phone,
    name: user!.name,
    hostelId: sub.hostelId,
    roomTypeId: sub.roomTypeId,
    source: 'subscription',
    subscriptionId: sub.id,
    startDate: sub.startDate,
    status: 'active',
  });
  return sub;
}

// --- reading ---------------------------------------------------------------

export async function openSubscription(userId: string, db: Tx = getDb()) {
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, userId), inArray(schema.subscriptions.status, ['pending', 'active'])))
    .limit(1);
  return sub ?? null;
}

export async function mySubscription(user: User) {
  const db = getDb();
  const sub = await openSubscription(user.id);
  if (!sub) return null;
  const [[hostel], [room], invoices, [move]] = await Promise.all([
    db
      .select({ id: schema.hostels.id, slug: schema.hostels.slug, name: schema.hostels.name, area: schema.hostels.area })
      .from(schema.hostels)
      .where(eq(schema.hostels.id, sub.hostelId)),
    db.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, sub.roomTypeId)),
    db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.subscriptionId, sub.id), inArray(schema.invoices.status, ['due', 'paid'])))
      .orderBy(desc(schema.invoices.periodStart)),
    db
      .select()
      .from(schema.moveRequests)
      .where(and(eq(schema.moveRequests.subscriptionId, sub.id), eq(schema.moveRequests.status, 'scheduled'))),
  ]);
  const today = clock.today();
  return {
    subscription: toSubscription(sub),
    hostel: hostel!,
    roomType: room!,
    currentPeriod: periodContaining(sub.startDate, today),
    invoices: invoices.map(toInvoice),
    scheduledMove: move ? { ...move, createdAt: move.createdAt.toISOString() } : null,
  };
}

export async function myInvoices(user: User) {
  const rows = await getDb()
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.userId, user.id), inArray(schema.invoices.status, ['due', 'paid'])))
    .orderBy(desc(schema.invoices.periodStart));
  return rows.map(toInvoice);
}

// --- cancel ----------------------------------------------------------------

async function cancelScheduledMoves(tx: Tx, subscriptionId: string, after?: string) {
  const moves = await tx
    .update(schema.moveRequests)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(schema.moveRequests.subscriptionId, subscriptionId),
        eq(schema.moveRequests.status, 'scheduled'),
        ...(after ? [gt(schema.moveRequests.moveDate, after)] : []),
      ),
    )
    .returning();
  for (const m of moves) await releaseBed(tx, m.toRoomTypeId);
}

/** Pending plans cancel now; active plans end with the current paid period. Cancelling twice changes nothing. */
export async function cancelSubscription(user: User) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sub = await openSubscription(user.id, tx);
    if (!sub) throw notFound('Subscription');
    if (sub.status === 'pending') {
      const [cancelled] = await tx
        .update(schema.subscriptions)
        .set({ status: 'cancelled', cancelAt: clock.today() })
        .where(and(eq(schema.subscriptions.id, sub.id), eq(schema.subscriptions.status, 'pending')))
        .returning();
      if (!cancelled) throw new AppError('invalid_state', 'This plan changed while cancelling; refresh and try again');
      await tx
        .update(schema.invoices)
        .set({ status: 'void' })
        .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.status, 'due')));
      await releaseBed(tx, sub.roomTypeId);
      await cancelScheduledMoves(tx, sub.id);
      return toSubscription(cancelled);
    }
    if (sub.cancelAt) return toSubscription(sub);
    const cancelAt = periodContaining(sub.startDate, clock.today()).end;
    const [updated] = await tx
      .update(schema.subscriptions)
      .set({ cancelAt })
      .where(eq(schema.subscriptions.id, sub.id))
      .returning();
    await tx
      .update(schema.invoices)
      .set({ status: 'void' })
      .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.status, 'due'), gt(schema.invoices.periodStart, cancelAt)));
    await cancelScheduledMoves(tx, sub.id, cancelAt);
    return toSubscription(updated!);
  });
}

// --- jobs ------------------------------------------------------------------

export async function expirePendingSubscriptions(now = clock.now()) {
  const cutoff = new Date(now.getTime() - PENDING_SUBSCRIPTION_TTL_MINUTES * 60_000);
  const db = getDb();
  const stale = await db
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.status, 'pending'), lt(schema.subscriptions.createdAt, cutoff)));
  let expired = 0;
  for (const s of stale) {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.subscriptions)
        .set({ status: 'expired' })
        .where(and(eq(schema.subscriptions.id, s.id), eq(schema.subscriptions.status, 'pending')))
        .returning();
      if (!row) return;
      await tx
        .update(schema.invoices)
        .set({ status: 'void' })
        .where(and(eq(schema.invoices.subscriptionId, s.id), eq(schema.invoices.status, 'due')));
      await releaseBed(tx, s.roomTypeId);
      await cancelScheduledMoves(tx, s.id);
      expired++;
    });
  }
  return expired;
}

/** Generates every bill whose generation day has come (catching up if the job was down). */
export async function generateUpcomingInvoices(today = clock.today()) {
  const db = getDb();
  const subs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.status, 'active'));
  let created = 0;
  for (const sub of subs) {
    const last = periodContaining(sub.startDate, today).index + 1;
    for (let n = 1; n <= last; n++) {
      const period = billingPeriod(sub.startDate, n);
      if (invoiceGenerationDate(period.start) > today) break;
      if (sub.cancelAt && period.start > sub.cancelAt) break;
      const row = await db.transaction((tx) => createInvoiceForPeriod(tx, sub, period));
      if (row) created++;
    }
  }
  return created;
}

export async function endCancelledSubscriptions(today = clock.today()) {
  const db = getDb();
  const due = await db
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.status, 'active'), lt(schema.subscriptions.cancelAt, today)));
  let ended = 0;
  for (const s of due) {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.subscriptions)
        .set({ status: 'ended' })
        .where(and(eq(schema.subscriptions.id, s.id), eq(schema.subscriptions.status, 'active')))
        .returning();
      if (!row) return;
      await releaseBed(tx, s.roomTypeId);
      await tx
        .update(schema.residencies)
        .set({ status: 'ended', endDate: s.cancelAt })
        .where(and(eq(schema.residencies.subscriptionId, s.id), eq(schema.residencies.status, 'active')));
      ended++;
    });
  }
  return ended;
}

// --- admin -----------------------------------------------------------------

export async function adminSubscriptions(status?: Subscription['status']) {
  const db = getDb();
  const s = schema.subscriptions;
  const rows = await db
    .select({ subscription: s, user: { id: schema.users.id, name: schema.users.name, phone: schema.users.phone }, hostelName: schema.hostels.name })
    .from(s)
    .innerJoin(schema.users, eq(schema.users.id, s.userId))
    .innerJoin(schema.hostels, eq(schema.hostels.id, s.hostelId))
    .where(status ? eq(s.status, status) : undefined)
    .orderBy(desc(s.createdAt))
    .limit(500);
  return rows.map((r) => ({ ...r, subscription: toSubscription(r.subscription) }));
}

export async function overdueInvoices() {
  const rows = await getDb()
    .select({ invoice: schema.invoices, userName: schema.users.name, phone: schema.users.phone, hostelName: schema.hostels.name })
    .from(schema.invoices)
    .innerJoin(schema.users, eq(schema.users.id, schema.invoices.userId))
    .innerJoin(schema.hostels, eq(schema.hostels.id, schema.invoices.hostelId))
    .where(eq(schema.invoices.status, 'due'))
    .orderBy(asc(schema.invoices.dueDate));
  return rows.filter((r) => isOverdue(r.invoice, clock.now())).map((r) => ({ ...r, invoice: toInvoice(r.invoice) }));
}
