import { type Diet, MEAL_PLANS, type MealPlan, type MySubscription } from '@hostels/shared';

/**
 * The food plan screen's starting point (product gap 1a): the plans the hostel can serve, what is picked first (a change
 * already scheduled, else the current plan), and whether saving would change anything.
 */
export function foodPlanChoices(mine: Pick<MySubscription, 'subscription' | 'scheduledFoodChange'>, foodAvailable: boolean) {
  const plans: readonly MealPlan[] = foodAvailable ? MEAL_PLANS : ['none'];
  const start = mine.scheduledFoodChange ?? mine.subscription;
  return { plans, mealPlan: start.mealPlan, diet: start.diet };
}

/** Saving the plan already in force is refused by the API; the screen says so before asking. */
export function sameAsNow(sub: { mealPlan: MealPlan; diet: Diet }, mealPlan: MealPlan, diet: Diet) {
  return sub.mealPlan === mealPlan && (mealPlan === 'none' || sub.diet === diet);
}
