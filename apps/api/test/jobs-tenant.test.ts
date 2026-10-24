import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { addDays, billingPeriod, invoiceGenerationDate, istDate, istInstant } from '@hostels/shared';
import { db, schema } from '../src/db';
import { completeDueMoves, endCancelledSubscriptions, expirePendingSubscriptions, generateUpcomingInvoices } from '../src/services/jobs-tenant';
import { createHostel, login, req, truncateAll } from './helpers';

beforeEach(truncateAll);

async function beds(roomTypeId: string) {
  const [r] = await db.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, roomTypeId));
  return r!.bedsAvailable;
}

async function setup() {
  const o = await login('owner');
  const { hostel, roomType } = await createHostel(o.user.id);
  const { hostel: dest, roomType: destRoom } = await createHostel(o.user.id, { name: 'Dest' }, { monthlyRent: 11000 });
  const t = await login();
  return { owner: o, hostel, roomType, dest, destRoom, tenant: t };
}

async function subscribe(token: string, hostelId: string, roomTypeId: string, pay = true) {
  const s = await req('POST', '/subscriptions', { token, body: { hostelId, roomTypeId, mealPlan: 'full', diet: 'veg' } });
  if (pay) await req('POST', `/payments/${s.body.invoice.id}/simulate`, { token });
  return s.body.subscription as { id: string; startDate: string };
}

/** Noon IST on a date, as an instant. */
const at = (date: string) => istInstant(date, 12);

describe('expire pending subscriptions', () => {
  test('after 30 minutes unpaid: expired, bed released, invoice void; idempotent', async () => {
    const { hostel, roomType, tenant } = await setup();
    const sub = await subscribe(tenant.token, hostel.id, roomType.id, false);
    expect(await beds(roomType.id)).toBe(4);
    expect(await expirePendingSubscriptions(new Date(Date.now() + 29 * 60_000))).toBe(0);
    expect(await expirePendingSubscriptions(new Date(Date.now() + 31 * 60_000))).toBe(1);
    expect(await expirePendingSubscriptions(new Date(Date.now() + 31 * 60_000))).toBe(0);
    expect(await beds(roomType.id)).toBe(5);
    const [s] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, sub.id));
    expect(s!.status).toBe('expired');
    const invs = await db.select().from(schema.invoices).where(eq(schema.invoices.subscriptionId, sub.id));
    expect(invs.every((i) => i.status === 'void')).toBe(true);
    // Paid subscriptions are untouched.
    const t2 = await login();
    await subscribe(t2.token, hostel.id, roomType.id, true);
    expect(await expirePendingSubscriptions(new Date(Date.now() + 60 * 60_000))).toBe(0);
  });
});

describe('generate upcoming invoices', () => {
  test('creates the next bill on its generation day only, with skip credits; idempotent', async () => {
    const { hostel, roomType, tenant } = await setup();
    const sub = await subscribe(tenant.token, hostel.id, roomType.id);
    const p1 = billingPeriod(sub.startDate, 1);
    const genDay = invoiceGenerationDate(p1.periodStart);
    await req('POST', '/me/skips', { token: tenant.token, body: { date: addDays(istDate(), 1), meal: 'dinner' } });

    expect(await generateUpcomingInvoices(at(addDays(genDay, -1)))).toBe(0);
    expect(await generateUpcomingInvoices(at(genDay))).toBe(1);
    expect(await generateUpcomingInvoices(at(genDay))).toBe(0);
    const [inv] = await db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.periodStart, p1.periodStart)));
    expect(inv).toMatchObject({ status: 'due', dueDate: p1.periodStart, periodEnd: p1.periodEnd, creditAmount: 80, totalAmount: 9000 + 6000 - 80 });
  });

  test('catches up missed periods and stops at the cancellation date', async () => {
    const { hostel, roomType, tenant } = await setup();
    const sub = await subscribe(tenant.token, hostel.id, roomType.id);
    const p3 = billingPeriod(sub.startDate, 3);
    expect(await generateUpcomingInvoices(at(p3.periodStart))).toBe(3);
    await db.update(schema.subscriptions).set({ status: 'cancelled', cancelAt: p3.periodEnd }).where(eq(schema.subscriptions.id, sub.id));
    expect(await generateUpcomingInvoices(at(addDays(p3.periodEnd, 10)))).toBe(0);
  });
});

describe('complete due moves', () => {
  test('switches room, releases the old bed and moves the residency on the move date', async () => {
    const { hostel, roomType, dest, destRoom, tenant } = await setup();
    const sub = await subscribe(tenant.token, hostel.id, roomType.id);
    const moveDate = addDays(istDate(), 2);
    const m = await req('POST', '/me/moves', { token: tenant.token, body: { toHostelId: dest.id, toRoomTypeId: destRoom.id, moveDate } });
    expect(m.status).toBe(201);
    expect(await beds(roomType.id)).toBe(4);
    expect(await beds(destRoom.id)).toBe(4);

    expect(await completeDueMoves(at(addDays(moveDate, -1)))).toBe(0);
    expect(await completeDueMoves(at(moveDate))).toBe(1);
    expect(await completeDueMoves(at(moveDate))).toBe(0);

    expect(await beds(roomType.id)).toBe(5);
    expect(await beds(destRoom.id)).toBe(4);
    const [s] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, sub.id));
    expect(s).toMatchObject({ hostelId: dest.id, roomTypeId: destRoom.id, status: 'active' });
    const res = await db.select().from(schema.residencies).where(eq(schema.residencies.subscriptionId, sub.id));
    const old = res.find((r) => r.hostelId === hostel.id)!;
    const now = res.find((r) => r.hostelId === dest.id)!;
    expect(old).toMatchObject({ status: 'ended', endDate: moveDate });
    expect(now).toMatchObject({ status: 'active', startDate: moveDate, monthlyRent: 11000 });
  });
});

describe('end cancelled subscriptions', () => {
  test('ends the day after cancelAt, releases the bed, ends the residency', async () => {
    const { hostel, roomType, tenant } = await setup();
    const sub = await subscribe(tenant.token, hostel.id, roomType.id);
    const c = await req('POST', '/me/subscription/cancel', { token: tenant.token });
    const cancelAt = c.body.cancelAt as string;
    expect(await endCancelledSubscriptions(at(cancelAt))).toBe(0);
    expect(await endCancelledSubscriptions(at(addDays(cancelAt, 1)))).toBe(1);
    expect(await endCancelledSubscriptions(at(addDays(cancelAt, 1)))).toBe(0);
    const [s] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, sub.id));
    expect(s!.status).toBe('ended');
    expect(await beds(roomType.id)).toBe(5);
    const [r] = await db.select().from(schema.residencies).where(eq(schema.residencies.subscriptionId, sub.id));
    expect(r).toMatchObject({ status: 'ended', endDate: cancelAt });
    // The tenant can subscribe again afterwards.
    const again = await req('POST', '/subscriptions', { token: tenant.token, body: { hostelId: hostel.id, roomTypeId: roomType.id, mealPlan: 'none', diet: 'veg' } });
    expect(again.status).toBe(201);
  });
});
