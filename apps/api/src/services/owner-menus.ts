/** Weekly menu editor and daily headcount for partner hostels. */
import { and, asc, eq, inArray, lte, or } from 'drizzle-orm';
import { addDays, isIsoDate, mealsInPlan, MEALS, newId, weekStart, type Headcount, type MenuWeek, type schemas } from '@hostels/shared';
import type { z } from 'zod';
import { db, schema, type DbOrTx } from '../db';
import { err } from '../lib/http';
import type { HostelRow } from './owner-access';

export function parseWeek(week: string | undefined): string {
  if (!week || !isIsoDate(week)) throw err.validation('week must be a date (YYYY-MM-DD)', [{ path: 'week', message: 'Required' }]);
  if (weekStart(week) !== week) throw err.validation('week must be a Monday', [{ path: 'week', message: 'Must be a Monday' }]);
  return week;
}

export async function getMenuWeek(hostelId: string, week: string, tx: DbOrTx = db): Promise<MenuWeek | null> {
  const [w] = await tx
    .select()
    .from(schema.menuWeeks)
    .where(and(eq(schema.menuWeeks.hostelId, hostelId), eq(schema.menuWeeks.weekStart, week)));
  if (!w) return null;
  const items = await tx
    .select({ item: schema.menuItems, partner: schema.foodPartners })
    .from(schema.menuItems)
    .leftJoin(schema.foodPartners, eq(schema.foodPartners.id, schema.menuItems.foodPartnerId))
    .where(eq(schema.menuItems.menuWeekId, w.id))
    .orderBy(asc(schema.menuItems.date));
  const order = (m: string) => MEALS.indexOf(m as (typeof MEALS)[number]);
  items.sort((a, b) => a.item.date.localeCompare(b.item.date) || order(a.item.meal) - order(b.item.meal));
  return {
    id: w.id,
    hostelId: w.hostelId,
    weekStart: w.weekStart,
    theme: w.theme,
    items: items.map(({ item, partner }) => ({
      id: item.id,
      date: item.date,
      meal: item.meal,
      vegDish: item.vegDish,
      nonVegDish: item.nonVegDish,
      foodPartner: partner ? { id: partner.id, name: partner.name, logoUrl: partner.logoUrl } : null,
    })),
  };
}

export async function saveMenu(hostel: HostelRow, week: string, input: z.output<typeof schemas.menuWeekInput>): Promise<MenuWeek> {
  const end = addDays(week, 6);
  const issues: { path: string; message: string }[] = [];
  const seen = new Set<string>();
  input.items.forEach((it, i) => {
    if (it.date < week || it.date > end) issues.push({ path: `items.${i}.date`, message: 'Date must be inside this week' });
    const key = `${it.date}:${it.meal}`;
    if (seen.has(key)) issues.push({ path: `items.${i}.meal`, message: 'Duplicate meal for this date' });
    seen.add(key);
  });
  const partnerIds = [...new Set(input.items.map((i) => i.foodPartnerId).filter((x): x is string => !!x))];
  if (partnerIds.length) {
    const found = await db
      .select({ id: schema.foodPartners.id })
      .from(schema.foodPartners)
      .where(and(inArray(schema.foodPartners.id, partnerIds), eq(schema.foodPartners.active, true)));
    const ok = new Set(found.map((f) => f.id));
    input.items.forEach((it, i) => {
      if (it.foodPartnerId && !ok.has(it.foodPartnerId)) issues.push({ path: `items.${i}.foodPartnerId`, message: 'Unknown or inactive food partner' });
    });
  }
  if (issues.length) throw err.validation('Some menu items are invalid', issues);

  await db.transaction(async (tx) => {
    const [w] = await tx
      .insert(schema.menuWeeks)
      .values({ id: newId('mnw'), hostelId: hostel.id, weekStart: week, theme: input.theme })
      .onConflictDoUpdate({ target: [schema.menuWeeks.hostelId, schema.menuWeeks.weekStart], set: { theme: input.theme } })
      .returning();
    await tx.delete(schema.menuItems).where(eq(schema.menuItems.menuWeekId, w!.id));
    if (input.items.length) {
      await tx.insert(schema.menuItems).values(
        input.items.map((it) => ({
          id: newId('mni'),
          menuWeekId: w!.id,
          date: it.date,
          meal: it.meal,
          vegDish: it.vegDish,
          nonVegDish: it.nonVegDish || null,
          foodPartnerId: it.foodPartnerId ?? null,
        })),
      );
    }
  });
  return (await getMenuWeek(hostel.id, week))!;
}

export async function copyLastWeek(hostel: HostelRow, week: string): Promise<MenuWeek> {
  const prev = await getMenuWeek(hostel.id, addDays(week, -7));
  if (!prev) throw err.notFound('Last week’s menu');
  return saveMenu(hostel, week, {
    theme: prev.theme,
    items: prev.items.map((i) => ({
      date: addDays(i.date, 7),
      meal: i.meal,
      vegDish: i.vegDish,
      nonVegDish: i.nonVegDish,
      foodPartnerId: i.foodPartner?.id ?? null,
    })),
  });
}

/**
 * Who eats at `hostelId` on `date`: subscriptions in force that day (counting scheduled moves),
 * whose plan includes the meal, minus skips, split by diet.
 */
export async function headcount(hostelId: string, date: string): Promise<Headcount> {
  const s = schema.subscriptions;
  const m = schema.moveRequests;
  const subs = await db
    .select()
    .from(s)
    .where(and(inArray(s.status, ['active', 'cancelled']), lte(s.startDate, date)));
  const moves = await db
    .select()
    .from(m)
    .where(and(eq(m.status, 'scheduled'), lte(m.moveDate, date), or(eq(m.toHostelId, hostelId), eq(m.fromHostelId, hostelId))));
  const movedAway = new Set(moves.filter((x) => x.fromHostelId === hostelId && x.toHostelId !== hostelId).map((x) => x.subscriptionId));
  const movingIn = new Set(moves.filter((x) => x.toHostelId === hostelId).map((x) => x.subscriptionId));
  const present = subs.filter(
    (x) => (x.cancelAt === null || x.cancelAt >= date) && ((x.hostelId === hostelId && !movedAway.has(x.id)) || movingIn.has(x.id)),
  );
  const skips = present.length
    ? await db
        .select()
        .from(schema.mealSkips)
        .where(and(eq(schema.mealSkips.date, date), inArray(schema.mealSkips.subscriptionId, present.map((p) => p.id))))
    : [];
  const skipped = new Set(skips.map((k) => `${k.subscriptionId}:${k.meal}`));
  return {
    date,
    meals: MEALS.map((meal) => {
      const eligible = present.filter((p) => mealsInPlan(p.mealPlan).includes(meal));
      const eating = eligible.filter((p) => !skipped.has(`${p.id}:${meal}`));
      const veg = eating.filter((p) => p.diet === 'veg').length;
      return { meal, total: eating.length, veg, nonVeg: eating.length - veg, skipped: eligible.length - eating.length };
    }),
  };
}
