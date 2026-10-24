import type {
  Diet,
  GenderType,
  HostelStatus,
  InvoiceStatus,
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  Meal,
  MealPlan,
  PartnerStatus,
  SharingType,
  SubscriptionStatus,
} from '@hostels/shared';
import { FOOD_PLANS } from '@hostels/shared';

export function rupees(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

/** `2026-10-24` → `24 Oct 2026` */
export function formatDate(date: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!date) return '—';
  const d = date.length === 10 ? new Date(`${date}T00:00:00+05:30`) : new Date(date);
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ...opts });
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(ts: string): string {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(ts);
}

export const SHARING_LABEL: Record<SharingType, string> = {
  private: 'Private room',
  '2-sharing': '2 sharing',
  '3-sharing': '3 sharing',
  '4-sharing': '4 sharing',
};
export const GENDER_LABEL: Record<GenderType, string> = { boys: 'Boys', girls: 'Girls', coliving: 'Co-living' };
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
export const MEAL_PLAN_LABEL: Record<MealPlan, string> = Object.fromEntries(
  Object.entries(FOOD_PLANS).map(([k, v]) => [k, v.label]),
) as Record<MealPlan, string>;
export const DIET_LABEL: Record<Diet, string> = { veg: 'Veg', 'non-veg': 'Non-veg' };
export const HOSTEL_STATUS_LABEL: Record<HostelStatus, string> = { draft: 'Draft', pending: 'In review', live: 'Live', rejected: 'Rejected' };
export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = { none: 'Not a partner', applied: 'Applied', verified: 'Verified partner', rejected: 'Partner rejected' };
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = { pending: 'Awaiting payment', active: 'Active', cancelled: 'Cancelling', ended: 'Ended', expired: 'Expired' };
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { due: 'Due', paid: 'Paid', void: 'Void' };
export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  food: 'Food',
  cleanliness: 'Cleanliness',
  maintenance: 'Maintenance',
  safety: 'Safety',
  wifi: 'WiFi',
  water: 'Water',
  staff: 'Staff',
  other: 'Other',
};
export const ISSUE_SEVERITY_LABEL: Record<IssueSeverity, string> = { low: 'Low', medium: 'Medium', high: 'High' };
export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function hours(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  if (h < 1) return '< 1 hr';
  if (h < 48) return `${Math.round(h)} hrs`;
  return `${Math.round(h / 24)} days`;
}
