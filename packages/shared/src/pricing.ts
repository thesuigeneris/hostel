import type { Meal, MealPlan } from './enums';

/** All amounts are whole rupees. */
export const FOOD_PLANS: Record<MealPlan, { label: string; meals: readonly Meal[]; price: number }> = {
  full: { label: 'Full board', meals: ['breakfast', 'lunch', 'dinner'], price: 6000 },
  'two-meals': { label: 'Breakfast + dinner', meals: ['breakfast', 'dinner'], price: 4500 },
  none: { label: 'No food', meals: [], price: 0 },
};

export const SKIP_CREDITS: Record<Meal, number> = {
  breakfast: 50,
  lunch: 80,
  dinner: 80,
};

export const DEFAULT_PLATFORM_FEE_PCT = 10;

export function mealsInPlan(plan: MealPlan): readonly Meal[] {
  return FOOD_PLANS[plan].meals;
}

export function planIncludesMeal(plan: MealPlan, meal: Meal): boolean {
  return FOOD_PLANS[plan].meals.includes(meal);
}

export function foodPrice(plan: MealPlan): number {
  return FOOD_PLANS[plan].price;
}

/** Credit applied to a bill: sum of skip credits, capped at the period's food price. */
export function cappedCredit(plan: MealPlan, skipCredits: number): number {
  return Math.max(0, Math.min(skipCredits, foodPrice(plan)));
}

export function billAmounts(opts: { rent: number; plan: MealPlan; skipCredits: number }): {
  rentAmount: number;
  foodAmount: number;
  creditAmount: number;
  totalAmount: number;
} {
  const foodAmount = foodPrice(opts.plan);
  const creditAmount = cappedCredit(opts.plan, opts.skipCredits);
  return {
    rentAmount: opts.rent,
    foodAmount,
    creditAmount,
    totalAmount: opts.rent + foodAmount - creditAmount,
  };
}

export function payoutAmounts(gross: number, feePct: number): { grossAmount: number; platformFee: number; netAmount: number } {
  const platformFee = Math.round((gross * feePct) / 100);
  return { grossAmount: gross, platformFee, netAmount: gross - platformFee };
}

/** What owners pay us, per hostel per month. Verified partners additionally pay the platform fee % on subscription revenue. */
export const OWNER_PLAN_PRICING: Record<import('./enums').OwnerPlan, { label: string; price: number; features: readonly string[] }> = {
  free: {
    label: 'Free listing',
    price: 0,
    features: ['Listing with photos, map pin and room types', 'Visit-request inbox', 'Resident reviews and issue board'],
  },
  pro: {
    label: 'Hostels Pro',
    price: 999,
    features: [
      'Everything in Free',
      'Resident register and rent ledger',
      'Issue desk with response-time analytics',
      'Announcements to all residents',
      'Boosted placement in search',
      'Insights: views, visit requests, occupancy',
    ],
  },
};
