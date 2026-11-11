import type { ISODate, Meal, MenuWeek, User } from '@hostels/shared';
import {
  addDays,
  canChangeSkip,
  FOOD_PLANS,
  isMonday,
  MEALS,
  type menuWeekInputSchema,
  newId,
  periodContaining,
  planIncludesMeal,
  SKIP_CREDITS,
  skipCutoff,
  weekStart,
} from '@hostels/shared';
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb, schema } from '../db';
import { clock } from '../lib/clock';
import { AppError, notFound } from '../lib/errors';
import { ownedHostel, requirePlanTier } from './access';
import { creditWindow, openSubscription } from './billing';

async function loadWeek(hostelId: string, start: string): Promise<MenuWeek | null> {
  const db = getDb();
  const [week] = await db
    .select()
    .from(schema.menuWeeks)
    .where(and(eq(schema.menuWeeks.hostelId, hostelId), eq(schema.menuWeeks.weekStart, start)));
  if (!week) return null;
  const items = await db
    .select()
    .from(schema.menuItems)
    .where(eq(schema.menuItems.menuWeekId, week.id))
    .orderBy(asc(schema.menuItems.date));
  const order = Object.fromEntries(MEALS.map((m, i) => [m, i]));
  items.sort((a, b) => a.date.localeCompare(b.date) || order[a.meal]! - order[b.meal]!);
  return { ...week, items };
}

export async function publicMenu(hostelId: string, date = clock.today()) {
  return loadWeek(hostelId, weekStart(date));
}

export async function ownerMenu(user: User, hostelId: string, start: string) {
  const h = await ownedHostel(user, hostelId);
  if (!isMonday(start)) throw new AppError('validation', 'Weeks start on a Monday', 400);
  return loadWeek(h.id, start);
}

/** Replaces a week's menu. Dates must fall inside the week. */
export async function saveMenu(user: User, hostelId: string, start: string, input: z.output<typeof menuWeekInputSchema>) {
  const h = await ownedHostel(user, hostelId);
  // A paused Partner hostel still feeds its existing subscribers, so its menu stays editable.
  await requirePlanTier(h.id, 'partner');
  if (!isMonday(start)) throw new AppError('validation', 'Weeks start on a Monday', 400);
  const end = addDays(start, 6);
  const bad = input.items.find((i) => i.date < start || i.date > end);
  if (bad) throw new AppError('validation', `${bad.date} is outside the week of ${start}`, 400);
  const seen = new Set<string>();
  for (const i of input.items) {
    const key = `${i.date}:${i.meal}`;
    if (seen.has(key)) throw new AppError('validation', `${i.meal} on ${i.date} appears twice`, 400);
    seen.add(key);
  }
  const partnerIds = [...new Set(input.items.map((i) => i.foodPartnerId).filter((x): x is string => !!x))];
  const db = getDb();
  if (partnerIds.length) {
    const found = await db
      .select({ id: schema.foodPartners.id })
      .from(schema.foodPartners)
      .where(and(inArray(schema.foodPartners.id, partnerIds), eq(schema.foodPartners.active, true)));
    if (found.length !== partnerIds.length) throw new AppError('validation', 'Unknown or inactive food partner', 400);
  }
  await db.transaction(async (tx) => {
    const [week] = await tx
      .insert(schema.menuWeeks)
      .values({ id: newId('mnw'), hostelId: h.id, weekStart: start, theme: input.theme })
      .onConflictDoUpdate({ target: [schema.menuWeeks.hostelId, schema.menuWeeks.weekStart], set: { theme: input.theme } })
      .returning();
    await tx.delete(schema.menuItems).where(eq(schema.menuItems.menuWeekId, week!.id));
    if (input.items.length) {
      await tx.insert(schema.menuItems).values(
        input.items.map((i) => ({
          id: newId('mni'),
          menuWeekId: week!.id,
          date: i.date,
          meal: i.meal,
          vegDish: i.vegDish,
          nonVegDish: i.nonVegDish || null,
          foodPartnerId: i.foodPartnerId || null,
        })),
      );
    }
  });
  return loadWeek(h.id, start);
}

/** Copies the previous week's menu onto this week, shifting dates by 7 days. */
export async function copyLastWeek(user: User, hostelId: string, start: string) {
  const h = await ownedHostel(user, hostelId);
  const prev = await loadWeek(h.id, addDays(start, -7));
  if (!prev) throw notFound('Last week’s menu');
  return saveMenu(user, hostelId, start, {
    theme: prev.theme,
    items: prev.items.map((i) => ({
      date: addDays(i.date, 7),
      meal: i.meal,
      vegDish: i.vegDish,
      nonVegDish: i.nonVegDish,
      foodPartnerId: i.foodPartnerId,
    })),
  });
}

// --- tenant: menu with skips -------------------------------------------------

/**
 * The first day whose skip credit no bill will ever carry, or null while the plan runs on. A skip's credit goes on
 * the bill whose credit window holds its date (`creditWindow`); a cancelled plan's bills stop at the last period that
 * starts by `cancelAt`, so skips after that bill's window earn nothing (the spec doesn't refund them in v1).
 */
export function noCreditFrom(sub: { startDate: ISODate; cancelAt: ISODate | null }): ISODate | null {
  if (!sub.cancelAt) return null;
  const last = periodContaining(sub.startDate, sub.cancelAt).index;
  // Ended inside the first period: the only bill is the first one, which carries no credits.
  return last === 0 ? sub.startDate : addDays(creditWindow(sub.startDate, last).to, 1);
}

/** What skipping a meal on a date takes off a bill. */
function skipCredit(sub: { startDate: ISODate; cancelAt: ISODate | null }, date: ISODate, meal: Meal) {
  const from = noCreditFrom(sub);
  return from && date >= from ? 0 : SKIP_CREDITS[meal];
}

async function activeSubscription(user: User) {
  const sub = await openSubscription(user.id);
  if (!sub || sub.status !== 'active') throw new AppError('invalid_state', 'You need an active plan for this');
  return sub;
}

/** The hostel serving a subscriber on a date (a scheduled move switches it from the move date). */
async function hostelOn(sub: typeof schema.subscriptions.$inferSelect, date: string) {
  const [move] = await getDb()
    .select()
    .from(schema.moveRequests)
    .where(and(eq(schema.moveRequests.subscriptionId, sub.id), eq(schema.moveRequests.status, 'scheduled'), lte(schema.moveRequests.moveDate, date)));
  return move?.toHostelId ?? sub.hostelId;
}

export async function myMenu(user: User, days = 7) {
  const sub = await activeSubscription(user);
  const today = clock.today();
  const now = clock.now();
  const db = getDb();
  const end = addDays(today, days - 1);
  const skips = await db
    .select()
    .from(schema.mealSkips)
    .where(and(eq(schema.mealSkips.subscriptionId, sub.id), gte(schema.mealSkips.date, today), lte(schema.mealSkips.date, end)));
  const skipped = new Set(skips.map((s) => `${s.date}:${s.meal}`));
  const partners = await db.select().from(schema.foodPartners);
  const weeks = new Map<string, MenuWeek | null>();
  const out = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(today, d);
    const hostelId = await hostelOn(sub, date);
    const key = `${hostelId}:${weekStart(date)}`;
    if (!weeks.has(key)) weeks.set(key, await loadWeek(hostelId, weekStart(date)));
    const week = weeks.get(key);
    const inService = !sub.cancelAt || date <= sub.cancelAt;
    out.push({
      date,
      hostelId,
      theme: week?.theme ?? null,
      meals: MEALS.map((meal) => {
        const item = week?.items.find((i) => i.date === date && i.meal === meal);
        const inPlan = inService && planIncludesMeal(sub.mealPlan, meal);
        return {
          meal,
          inPlan,
          vegDish: item?.vegDish ?? null,
          nonVegDish: item?.nonVegDish ?? null,
          foodPartner: item?.foodPartnerId ? (partners.find((p) => p.id === item.foodPartnerId)?.name ?? null) : null,
          skipped: skipped.has(`${date}:${meal}`),
          cutoff: skipCutoff(date, meal).toISOString(),
          canChange: inPlan && canChangeSkip(date, meal, now),
          credit: skipCredit(sub, date, meal),
        };
      }),
    });
  }
  return { mealPlan: sub.mealPlan, diet: sub.diet, planLabel: FOOD_PLANS[sub.mealPlan].label, noCreditFrom: noCreditFrom(sub), days: out };
}

async function checkSkippable(sub: typeof schema.subscriptions.$inferSelect, date: string, meal: Meal) {
  if (!planIncludesMeal(sub.mealPlan, meal)) throw new AppError('meal_not_in_plan', `Your plan does not include ${meal}`);
  if (date < sub.startDate || (sub.cancelAt && date > sub.cancelAt)) throw new AppError('invalid_state', 'That date is outside your plan');
  if (!canChangeSkip(date, meal, clock.now())) {
    throw new AppError('cutoff_passed', `Too late to change ${meal} on ${date}; the cut-off has passed`);
  }
}

export async function skipMeal(user: User, date: string, meal: Meal) {
  const sub = await activeSubscription(user);
  await checkSkippable(sub, date, meal);
  const db = getDb();
  // A skip in the last stretch of a cancelled plan still tells the kitchen (headcount), but earns nothing: no bill
  // will carry it.
  await db
    .insert(schema.mealSkips)
    .values({ id: newId('skp'), subscriptionId: sub.id, date, meal, creditAmount: skipCredit(sub, date, meal) })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(schema.mealSkips)
    .where(and(eq(schema.mealSkips.subscriptionId, sub.id), eq(schema.mealSkips.date, date), eq(schema.mealSkips.meal, meal)));
  return { ...row!, createdAt: row!.createdAt.toISOString() };
}

export async function unskipMeal(user: User, date: string, meal: Meal) {
  const sub = await activeSubscription(user);
  await checkSkippable(sub, date, meal);
  await getDb()
    .delete(schema.mealSkips)
    .where(and(eq(schema.mealSkips.subscriptionId, sub.id), eq(schema.mealSkips.date, date), eq(schema.mealSkips.meal, meal)));
  return { ok: true as const };
}

// --- owner: headcount and subscribers ---------------------------------------

/**
 * Per meal on a date: subscribers eating at this hostel whose plan has the meal, minus skips, split by diet. Who eats
 * here is worked out in SQL for this hostel only: its subscribers, plus those with a move into it on or before the
 * date, minus those with a move out by then.
 */
export async function headcount(user: User, hostelId: string, date: string) {
  const h = await ownedHostel(user, hostelId);
  const db = getDb();
  const s = schema.subscriptions;
  const m = schema.moveRequests;
  const eating = await db
    .select({ id: s.id, mealPlan: s.mealPlan, diet: s.diet })
    .from(s)
    // A subscription has at most one scheduled move; once its date has come, the tenant eats at the destination.
    .leftJoin(m, and(eq(m.subscriptionId, s.id), eq(m.status, 'scheduled'), lte(m.moveDate, date)))
    .where(
      and(
        eq(s.status, 'active'),
        lte(s.startDate, date),
        or(isNull(s.cancelAt), gte(s.cancelAt, date)),
        or(eq(s.hostelId, h.id), eq(m.toHostelId, h.id)),
        sql`coalesce(${m.toHostelId}, ${s.hostelId}) = ${h.id}`,
      ),
    );
  const skips = eating.length
    ? await db
        .select()
        .from(schema.mealSkips)
        .where(and(eq(schema.mealSkips.date, date), inArray(schema.mealSkips.subscriptionId, eating.map((e) => e.id))))
    : [];
  return {
    date,
    meals: MEALS.map((meal) => {
      const subs = eating.filter((e) => planIncludesMeal(e.mealPlan, meal));
      const skippedIds = new Set(skips.filter((k) => k.meal === meal).map((k) => k.subscriptionId));
      const present = subs.filter((e) => !skippedIds.has(e.id));
      return {
        meal,
        total: present.length,
        veg: present.filter((e) => e.diet === 'veg').length,
        nonVeg: present.filter((e) => e.diet === 'non-veg').length,
        skipped: subs.length - present.length,
      };
    }),
  };
}

export async function subscribers(user: User, hostelId: string) {
  const h = await ownedHostel(user, hostelId);
  const s = schema.subscriptions;
  const rows = await getDb()
    .select({
      subscription: s,
      user: { id: schema.users.id, name: schema.users.name, phone: schema.users.phone },
      sharing: schema.roomTypes.sharing,
    })
    .from(s)
    .innerJoin(schema.users, eq(schema.users.id, s.userId))
    .innerJoin(schema.roomTypes, eq(schema.roomTypes.id, s.roomTypeId))
    .where(and(eq(s.hostelId, h.id), inArray(s.status, ['pending', 'active'])))
    .orderBy(asc(s.startDate));
  return rows.map((r) => ({ ...r, subscription: { ...r.subscription, createdAt: r.subscription.createdAt.toISOString() } }));
}

// --- food partners (admin) ----------------------------------------------------

export async function listFoodPartners(activeOnly = false) {
  const q = getDb().select().from(schema.foodPartners).orderBy(asc(schema.foodPartners.name)).$dynamic();
  return activeOnly ? q.where(eq(schema.foodPartners.active, true)) : q;
}
