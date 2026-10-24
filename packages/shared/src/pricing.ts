import { addDays, addMonths, daysBetween, istDate, istInstant, type ISODate } from './time';

/** Money is whole rupees everywhere. */

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_PLANS = ['full', 'two-meals', 'none'] as const;
export type MealPlan = (typeof MEAL_PLANS)[number];

export const DIETS = ['veg', 'non-veg'] as const;
export type Diet = (typeof DIETS)[number];

export const FOOD_PLANS: Record<MealPlan, { label: string; meals: readonly Meal[]; price: number }> = {
  full: { label: 'Full board', meals: ['breakfast', 'lunch', 'dinner'], price: 6000 },
  'two-meals': { label: 'Breakfast + dinner', meals: ['breakfast', 'dinner'], price: 4500 },
  none: { label: 'No food', meals: [], price: 0 },
};

export const SKIP_CREDITS: Record<Meal, number> = { breakfast: 50, lunch: 80, dinner: 80 };

/** Skip cut-offs in IST: day offset from the meal's date, and the time on that day. */
export const SKIP_CUTOFFS: Record<Meal, { dayOffset: number; hour: number; minute: number }> = {
  breakfast: { dayOffset: -1, hour: 22, minute: 0 },
  lunch: { dayOffset: 0, hour: 9, minute: 0 },
  dinner: { dayOffset: 0, hour: 15, minute: 0 },
};

export const DEFAULT_PLATFORM_FEE_PCT = 10;
export const INVOICE_LEAD_DAYS = 5;
export const OVERDUE_GRACE_DAYS = 7;
export const PENDING_SUBSCRIPTION_TTL_MINUTES = 30;

export function planIncludesMeal(plan: MealPlan, meal: Meal): boolean {
  return FOOD_PLANS[plan].meals.includes(meal);
}

export function skipCutoff(date: ISODate, meal: Meal): Date {
  const c = SKIP_CUTOFFS[meal];
  return istInstant(addDays(date, c.dayOffset), c.hour, c.minute);
}

export function canChangeSkip(date: ISODate, meal: Meal, now: Date = new Date()): boolean {
  return now.getTime() < skipCutoff(date, meal).getTime();
}

export type BillAmounts = {
  rentAmount: number;
  foodAmount: number;
  creditAmount: number;
  totalAmount: number;
};

/** Monthly bill = rent + food − skip credits, with credits capped at the food price. */
export function computeBill(input: { rent: number; mealPlan: MealPlan; skipCredits: number }): BillAmounts {
  const foodAmount = FOOD_PLANS[input.mealPlan].price;
  const creditAmount = Math.min(Math.max(0, input.skipCredits), foodAmount);
  return {
    rentAmount: input.rent,
    foodAmount,
    creditAmount,
    totalAmount: input.rent + foodAmount - creditAmount,
  };
}

export type BillingPeriod = { index: number; start: ISODate; end: ISODate };

/** Period n runs from start + n months to the day before start + (n+1) months. */
export function billingPeriod(subscriptionStart: ISODate, index: number): BillingPeriod {
  return {
    index,
    start: addMonths(subscriptionStart, index),
    end: addDays(addMonths(subscriptionStart, index + 1), -1),
  };
}

/** The period that contains `date` (period 0 for dates before the start). */
export function periodContaining(subscriptionStart: ISODate, date: ISODate): BillingPeriod {
  let index = 0;
  while (billingPeriod(subscriptionStart, index + 1).start <= date) index++;
  return billingPeriod(subscriptionStart, index);
}

/** The bill for a period is generated this many days before it starts. Period 0 is billed at subscribe time. */
export function invoiceGenerationDate(periodStart: ISODate): ISODate {
  return addDays(periodStart, -INVOICE_LEAD_DAYS);
}

/** Overdue is derived on read: still unpaid more than 7 days after the due date. */
export function isOverdue(invoice: { status: string; dueDate: ISODate }, now: Date = new Date()): boolean {
  return invoice.status === 'due' && daysBetween(invoice.dueDate, istDate(now)) > OVERDUE_GRACE_DAYS;
}

export function computePayout(grossAmount: number, feePct: number) {
  const platformFee = Math.round((grossAmount * feePct) / 100);
  return { grossAmount, platformFee, netAmount: grossAmount - platformFee };
}

export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
