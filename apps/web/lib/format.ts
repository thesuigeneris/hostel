import { FOOD_PLANS, type MealPlan } from '@hostels/shared';

export const rupees = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN')}`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateLabel(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}
export function monthLabel(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m! - 1]} ${y}`;
}
export function weekday(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}
export function timeAgo(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const SHARING_LABEL: Record<string, string> = {
  private: 'Private room',
  '2-sharing': '2 sharing',
  '3-sharing': '3 sharing',
  '4-sharing': '4 sharing',
};
export const GENDER_LABEL: Record<string, string> = { boys: 'Boys', girls: 'Girls', coliving: 'Co-living' };
export const planLabel = (p: MealPlan) => FOOD_PLANS[p].label;
export const titleCase = (s: string) => s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const phoneLink = (p: string) => `tel:+91${p}`;
export const whatsappLink = (p: string, text: string) => `https://wa.me/91${p}?text=${encodeURIComponent(text)}`;
