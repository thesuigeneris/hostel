/** Residency rows that follow a subscription's lifecycle (addendum §2). */
import { and, eq, inArray } from 'drizzle-orm';
import { newId } from '@hostels/shared';
import { schema, type DbOrTx } from '../db';

/** Create the active residency for a subscription at a hostel. Idempotent per user+hostel. */
export async function startSubscriptionResidency(
  tx: DbOrTx,
  opts: { userId: string; hostelId: string; subscriptionId: string; startDate: string; monthlyRent: number },
) {
  // A pending claim at the same hostel is superseded by the subscription.
  const [open] = await tx
    .select()
    .from(schema.residencies)
    .where(and(eq(schema.residencies.userId, opts.userId), eq(schema.residencies.hostelId, opts.hostelId), inArray(schema.residencies.status, ['pending', 'active'])));
  if (open) {
    await tx
      .update(schema.residencies)
      .set({ status: 'active', source: 'subscription', subscriptionId: opts.subscriptionId, monthlyRent: opts.monthlyRent })
      .where(eq(schema.residencies.id, open.id));
    return;
  }
  await tx
    .insert(schema.residencies)
    .values({
      id: newId('res'),
      userId: opts.userId,
      hostelId: opts.hostelId,
      subscriptionId: opts.subscriptionId,
      source: 'subscription',
      status: 'active',
      startDate: opts.startDate,
      monthlyRent: opts.monthlyRent,
    })
    .onConflictDoNothing();
}

/** End the subscription's active residency at a hostel. */
export async function endSubscriptionResidency(tx: DbOrTx, opts: { subscriptionId: string; hostelId: string; endDate: string }) {
  await tx
    .update(schema.residencies)
    .set({ status: 'ended', endDate: opts.endDate })
    .where(
      and(
        eq(schema.residencies.subscriptionId, opts.subscriptionId),
        eq(schema.residencies.hostelId, opts.hostelId),
        eq(schema.residencies.status, 'active'),
      ),
    );
}
