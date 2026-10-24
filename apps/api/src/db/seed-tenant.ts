import { asc, eq, sql } from 'drizzle-orm';
import { SKIP_CREDITS, addDays, istDate, newId } from '@hostels/shared';
import { createInvoiceForPeriod } from '../services/billing';
import { startSubscriptionResidency } from '../services/residency';
import { db, schema } from './index';
import type { SeedCtx } from './seed-context';

/** Seed demo subscriptions, invoices, skips for the demo tenant. */
export async function seedTenant(ctx: SeedCtx): Promise<void> {
  const hostel = ctx.hostels.find((h) => h.partnerStatus === 'verified');
  if (!hostel) return;
  const [room] = await db.select().from(schema.roomTypes).where(eq(schema.roomTypes.hostelId, hostel.id)).orderBy(asc(schema.roomTypes.monthlyRent));
  if (!room) return;

  const today = istDate();
  const startDate = addDays(today, -10);
  const [sub] = await db
    .insert(schema.subscriptions)
    .values({
      id: newId('sub'),
      userId: ctx.tenant.id,
      hostelId: hostel.id,
      roomTypeId: room.id,
      mealPlan: 'full',
      diet: 'non-veg',
      status: 'active',
      startDate,
      createdAt: new Date(Date.now() - 10 * 86_400_000),
    })
    .returning();
  await db
    .update(schema.roomTypes)
    .set({ bedsAvailable: sql`greatest(${schema.roomTypes.bedsAvailable} - 1, 0)` })
    .where(eq(schema.roomTypes.id, room.id));

  const invoice = await createInvoiceForPeriod(sub!, 0);
  await db
    .update(schema.invoices)
    .set({ status: 'paid', paidAt: new Date(Date.now() - 10 * 86_400_000), razorpayOrderId: `order_seed_${invoice!.id.slice(4)}`, razorpayPaymentId: 'pay_seed' })
    .where(eq(schema.invoices.id, invoice!.id));
  await startSubscriptionResidency(db, { userId: ctx.tenant.id, hostelId: hostel.id, subscriptionId: sub!.id, startDate, monthlyRent: room.monthlyRent });

  await db.insert(schema.mealSkips).values([
    { id: newId('skp'), subscriptionId: sub!.id, date: addDays(today, -3), meal: 'lunch', creditAmount: SKIP_CREDITS.lunch },
    { id: newId('skp'), subscriptionId: sub!.id, date: addDays(today, -2), meal: 'dinner', creditAmount: SKIP_CREDITS.dinner },
  ]);

  // A visit request to a free listing so the owner inbox and "my visits" have something.
  const free = ctx.hostels.find((h) => h.partnerStatus !== 'verified');
  if (free) {
    await db.insert(schema.visitRequests).values({
      id: newId('vis'),
      hostelId: free.id,
      userId: ctx.tenant.id,
      preferredDate: addDays(today, 2),
      message: 'Can I see a 3-sharing room on Saturday morning?',
    });
  }
}
