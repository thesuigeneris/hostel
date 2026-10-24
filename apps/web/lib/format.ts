import { FOOD_PLANS, type MealPlan } from '@hostels/shared';

export { dateLabel, GENDER_LABEL, monthLabel, reviewSource, rupees, SHARING_LABEL, timeAgo, titleCase, weekday } from '@hostels/shared';

export const planLabel = (p: MealPlan) => FOOD_PLANS[p].label;
export const phoneLink = (p: string) => `tel:+91${p}`;
export const whatsappLink = (p: string, text: string) => `https://wa.me/91${p}?text=${encodeURIComponent(text)}`;
