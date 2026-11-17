import type { Diet, MealPlan, User } from '@hostels/shared';
import { billingPeriod, FOOD_PLANS, newId, periodContaining, planIncludesMeal } from '@hostels/shared';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDb, schema, type Tx } from '../db';
import { clock } from '../lib/clock';
import { isUniqueViolation } from '../lib/db-errors';
import { AppError, notFound } from '../lib/errors';
import { openSubscription, placeOn, regenerateUnpaidFrom } from './billing';
import { toFoodPlanChange } from './food-plan-state';

/**
 * Changing the food plan or diet without cancelling (product gap 1a, spec
 * `docs/superpowers/specs/2026-11-13-food-plan-change.md`). A change starts with the first billing period whose bill is
 * not paid yet, so nobody is charged twice or refunded for days already eaten. Bills already made for that period on are
 * made again at the new price, and the daily job writes the change onto the subscription on its first day. Until then,
 * the menu, skips and the kitchen headcount use the plan in force on each date (`planOn`).
 */

type SubRow = typeof schema.subscriptions.$inferSelect;

/** First day of the first billing period after today whose bill is not paid. */
async function firstUnpaidPeriodStart(tx: Tx, sub: SubRow) {
  const today = clock.today();
  const paid = await tx
    .select({ periodStart: schema.invoices.periodStart })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.subscriptionId, sub.id), eq(schema.invoices.status, 'paid'), gte(schema.invoices.periodStart, today)));
  const paidStarts = new Set(paid.map((p) => p.periodStart));
  let n = periodContaining(sub.startDate, today).index + 1;
  while (paidStarts.has(billingPeriod(sub.startDate, n).start)) n++;
  return billingPeriod(sub.startDate, n).start;
}

export async function scheduleFoodChange(user: User, input: { mealPlan: MealPlan; diet: Diet }) {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const sub = await openSubscription(user.id, tx);
      if (!sub || sub.status !== 'active') throw new AppError('invalid_state', 'You need an active plan to change your food');
      // Without food, the diet changes nothing.
      if (input.mealPlan === sub.mealPlan && (input.mealPlan === 'none' || input.diet === sub.diet)) {
        throw new AppError('invalid_state', 'That is already your food plan. To keep it, cancel the change you scheduled.');
      }
      const effectiveFrom = await firstUnpaidPeriodStart(tx, sub);
      if (sub.cancelAt && effectiveFrom > sub.cancelAt) {
        throw new AppError('invalid_state', 'Your plan ends before your next bill, so there is no bill left to change');
      }
      if (input.mealPlan !== 'none') {
        // Where they will live then, counting a scheduled move.
        const place = await placeOn(tx, sub, effectiveFrom);
        const [hostel] = await tx.select({ foodAvailable: schema.hostels.foodAvailable }).from(schema.hostels).where(eq(schema.hostels.id, place.hostelId));
        if (!hostel?.foodAvailable) throw new AppError('invalid_state', 'Your hostel does not serve food then');
      }
      // A new request replaces the one already scheduled.
      await tx
        .update(schema.foodPlanChanges)
        .set({ status: 'cancelled' })
        .where(and(eq(schema.foodPlanChanges.subscriptionId, sub.id), eq(schema.foodPlanChanges.status, 'scheduled')));
      const [change] = await tx
        .insert(schema.foodPlanChanges)
        .values({ id: newId('fpc'), subscriptionId: sub.id, mealPlan: input.mealPlan, diet: input.diet, effectiveFrom, createdAt: clock.now() })
        .returning();
      // Skips of meals the new plan leaves out would earn credit on a bill that no longer charges for them.
      const dropped = FOOD_PLANS[sub.mealPlan].meals.filter((m) => !planIncludesMeal(input.mealPlan, m));
      if (dropped.length) {
        await tx
          .delete(schema.mealSkips)
          .where(and(eq(schema.mealSkips.subscriptionId, sub.id), gte(schema.mealSkips.date, effectiveFrom), inArray(schema.mealSkips.meal, dropped)));
      }
      await regenerateUnpaidFrom(tx, sub, effectiveFrom);
      return toFoodPlanChange(change!);
    });
  } catch (e) {
    if (isUniqueViolation(e, 'food_plan_changes_one_scheduled')) {
      throw new AppError('invalid_state', 'Your food plan changed while saving; refresh and try again');
    }
    throw e;
  }
}

export async function cancelFoodChange(user: User, changeId: string) {
  return getDb().transaction(async (tx) => {
    const sub = await openSubscription(user.id, tx);
    const [change] = await tx.select().from(schema.foodPlanChanges).where(eq(schema.foodPlanChanges.id, changeId));
    if (!sub || !change || change.subscriptionId !== sub.id) throw notFound('Food plan change');
    const [cancelled] = await tx
      .update(schema.foodPlanChanges)
      .set({ status: 'cancelled' })
      .where(and(eq(schema.foodPlanChanges.id, change.id), eq(schema.foodPlanChanges.status, 'scheduled')))
      .returning();
    if (!cancelled) throw new AppError('invalid_state', 'This change has already started or was cancelled');
    await regenerateUnpaidFrom(tx, sub, change.effectiveFrom);
    return toFoodPlanChange(cancelled);
  });
}

/** Job: on its first day, a change becomes the subscription's plan. A plan no longer active drops it. */
export async function applyDueFoodChanges(today = clock.today()) {
  const db = getDb();
  const t = schema.foodPlanChanges;
  const due = await db.select().from(t).where(and(eq(t.status, 'scheduled'), lte(t.effectiveFrom, today)));
  let applied = 0;
  for (const c of due) {
    await db.transaction(async (tx) => {
      const [sub] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, c.subscriptionId)).for('update');
      const live = sub && sub.status === 'active' && (!sub.cancelAt || sub.cancelAt >= c.effectiveFrom);
      const [row] = await tx
        .update(t)
        .set({ status: live ? 'applied' : 'cancelled' })
        .where(and(eq(t.id, c.id), eq(t.status, 'scheduled')))
        .returning();
      if (!row || !live) return;
      await tx.update(schema.subscriptions).set({ mealPlan: c.mealPlan, diet: c.diet }).where(eq(schema.subscriptions.id, sub.id));
      applied++;
    });
  }
  return applied;
}
