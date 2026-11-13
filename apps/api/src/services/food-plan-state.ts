import type { Diet, FoodPlanChange, MealPlan } from '@hostels/shared';
import { and, eq, gt } from 'drizzle-orm';
import { type getDb, schema, type Tx } from '../db';

// Read side of food plan changes, shared by billing, the menu and the kitchen headcount (services/food-plan.ts has the
// writes). Kept apart so billing can use it without importing the service that imports billing.

type ChangeRow = typeof schema.foodPlanChanges.$inferSelect;

export function toFoodPlanChange(r: ChangeRow): FoodPlanChange {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

/** The change waiting for its first day, if any (at most one per subscription). */
export async function scheduledFoodChange(tx: Tx | ReturnType<typeof getDb>, subscriptionId: string): Promise<ChangeRow | null> {
  const [row] = await tx
    .select()
    .from(schema.foodPlanChanges)
    .where(and(eq(schema.foodPlanChanges.subscriptionId, subscriptionId), eq(schema.foodPlanChanges.status, 'scheduled')));
  return row ?? null;
}

/** The plan and diet in force on a date: a scheduled change counts from its first day. */
export function planOn(
  sub: { mealPlan: MealPlan; diet: Diet },
  change: Pick<ChangeRow, 'status' | 'effectiveFrom' | 'mealPlan' | 'diet'> | null,
  date: string,
): { mealPlan: MealPlan; diet: Diet } {
  return change && change.status === 'scheduled' && date >= change.effectiveFrom
    ? { mealPlan: change.mealPlan, diet: change.diet }
    : { mealPlan: sub.mealPlan, diet: sub.diet };
}

/** Drops scheduled changes that would start after `lastDay` (all of them without it): the plan ends first. */
export async function cancelFoodChangesAfter(tx: Tx, subscriptionId: string, lastDay?: string) {
  const t = schema.foodPlanChanges;
  await tx
    .update(t)
    .set({ status: 'cancelled' })
    .where(and(eq(t.subscriptionId, subscriptionId), eq(t.status, 'scheduled'), ...(lastDay ? [gt(t.effectiveFrom, lastDay)] : [])));
}
