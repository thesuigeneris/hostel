/** Meal skips and the tenant's 7-day menu (base spec §4, §6). */
import { and, eq, gte, lte } from 'drizzle-orm';
import type { Meal, WeekMenuForTenant } from '@hostels/shared';
import { MEALS, SKIP_CREDITS, addDays, isBeforeSkipCutoff, istDate, newId, planIncludesMeal, skipCutoff, weekStart } from '@hostels/shared';
import { db, schema } from '../db';
import { err } from '../lib/http';
import { toMealSkip } from '../lib/serialize-tenant';
import { menuWeekFor } from './public-read';
import { currentSubscription } from './subscriptions';

type SubRow = typeof schema.subscriptions.$inferSelect;

export const MENU_DAYS = 7;
/** How far ahead a meal can be skipped. */
export const SKIP_HORIZON_DAYS = 30;

/** Is the plan in force on this date (started, and not past the cancellation date)? */
function coversDate(sub: SubRow, date: string) {
  return date >= sub.startDate && (!sub.cancelAt || date <= sub.cancelAt);
}

async function skippableSubscription(userId: string): Promise<SubRow> {
  const sub = await currentSubscription(userId);
  if (!sub || (sub.status !== 'active' && sub.status !== 'cancelled')) throw err.notFound('Active subscription');
  return sub;
}

function checkSkippable(sub: SubRow, date: string, meal: Meal, now: Date) {
  if (!planIncludesMeal(sub.mealPlan, meal)) throw err.domain('meal_not_in_plan', 'That meal is not part of your food plan');
  if (!isBeforeSkipCutoff(date, meal, now)) throw err.domain('cutoff_passed', 'The cut-off for this meal has passed');
  if (!coversDate(sub, date)) throw err.domain('validation', 'Your plan does not cover that date');
  if (date > addDays(istDate(now), SKIP_HORIZON_DAYS)) throw err.domain('validation', `You can skip up to ${SKIP_HORIZON_DAYS} days ahead`);
}

export async function skipMeal(userId: string, date: string, meal: Meal, now = new Date()) {
  const sub = await skippableSubscription(userId);
  checkSkippable(sub, date, meal, now);
  const [created] = await db
    .insert(schema.mealSkips)
    .values({ id: newId('skp'), subscriptionId: sub.id, date, meal, creditAmount: SKIP_CREDITS[meal] })
    .onConflictDoNothing()
    .returning();
  if (created) return toMealSkip(created);
  const [existing] = await db
    .select()
    .from(schema.mealSkips)
    .where(and(eq(schema.mealSkips.subscriptionId, sub.id), eq(schema.mealSkips.date, date), eq(schema.mealSkips.meal, meal)));
  return toMealSkip(existing!);
}

export async function unskipMeal(userId: string, date: string, meal: Meal, now = new Date()) {
  const sub = await skippableSubscription(userId);
  if (!isBeforeSkipCutoff(date, meal, now)) throw err.domain('cutoff_passed', 'The cut-off for this meal has passed');
  const deleted = await db
    .delete(schema.mealSkips)
    .where(and(eq(schema.mealSkips.subscriptionId, sub.id), eq(schema.mealSkips.date, date), eq(schema.mealSkips.meal, meal)))
    .returning();
  if (deleted.length === 0) throw err.notFound('Skip');
}

export async function tenantMenu(userId: string, now = new Date()): Promise<WeekMenuForTenant> {
  const sub = await currentSubscription(userId);
  if (!sub) return { days: [] };
  const today = istDate(now);
  const dates = Array.from({ length: MENU_DAYS }, (_, i) => addDays(today, i));

  const [[move], skips] = await Promise.all([
    db
      .select()
      .from(schema.moveRequests)
      .where(and(eq(schema.moveRequests.subscriptionId, sub.id), eq(schema.moveRequests.status, 'scheduled')))
      .limit(1),
    db
      .select()
      .from(schema.mealSkips)
      .where(and(eq(schema.mealSkips.subscriptionId, sub.id), gte(schema.mealSkips.date, dates[0]!), lte(schema.mealSkips.date, dates[dates.length - 1]!))),
  ]);
  const hostelOn = (d: string) => (move && d >= move.moveDate ? move.toHostelId : sub.hostelId);

  // Load every (hostel, week) menu the 7 days touch.
  const menus = new Map<string, Awaited<ReturnType<typeof menuWeekFor>>>();
  for (const d of dates) {
    const key = `${hostelOn(d)}|${weekStart(d)}`;
    if (!menus.has(key)) menus.set(key, await menuWeekFor(hostelOn(d), weekStart(d)));
  }
  const skipped = new Set(skips.map((s) => `${s.date}|${s.meal}`));
  const live = sub.status === 'active' || sub.status === 'cancelled';

  return {
    days: dates.map((date) => {
      const menu = menus.get(`${hostelOn(date)}|${weekStart(date)}`);
      return {
        date,
        meals: MEALS.map((meal) => {
          const inPlan = planIncludesMeal(sub.mealPlan, meal);
          return {
            meal,
            inPlan,
            item: menu?.items.find((i) => i.date === date && i.meal === meal) ?? null,
            skipped: skipped.has(`${date}|${meal}`),
            canToggle: live && inPlan && coversDate(sub, date) && isBeforeSkipCutoff(date, meal, now),
            cutoffAt: skipCutoff(date, meal).toISOString(),
          };
        }),
      };
    }),
  };
}

