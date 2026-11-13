import { PARTNER_STANDARDS } from './owner-admin';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  formatRupees,
  INVOICE_LEAD_DAYS,
  OVERDUE_GRACE_DAYS,
  OWNER_DOWNGRADE_DAYS,
  OWNER_PLANS,
  OWNER_TRIAL_MONTHS,
} from './pricing';
import { addDays, daysBetween, type ISODate } from './time';
import type { HostelStatus, IssueStatus, OwnerPlanTier, PartnerStatus, ResidencyStatus, VisitStatus } from './types';

// Owner-side rules that the API, the website and the app must agree on. Kept pure so each is unit tested once.

// ---------------------------------------------------------------------------
// Issues: "needs a response"

/** A resident's report (or reopen) waits this long for the hostel's first answer before it counts as overdue. */
export const RESPONSE_DUE_HOURS = 24;

type Instant = Date | string;
const ms = (t: Instant) => (typeof t === 'string' ? Date.parse(t) : t.getTime());

export type ResponseFacts = {
  status: IssueStatus;
  createdAt: Instant;
  /** First response of any kind (a status move, or the hostel's first comment). */
  acknowledgedAt: Instant | null;
  /** The latest time the reporter reopened it, if ever. */
  reopenedAt: Instant | null;
  /** The hostel owner's latest comment or status move on it. */
  ownerRespondedAt: Instant | null;
};

/**
 * When the hostel's answer has been awaited since: the report, or the latest reopen. Null once the hostel answered
 * (a comment or a status move counts) or when the issue isn't open.
 */
export function awaitingReplySince(i: ResponseFacts): Date | null {
  if (i.status !== 'open') return null;
  if (i.reopenedAt) {
    // A reopen asks again: only an answer after it counts.
    const answered = i.ownerRespondedAt !== null && ms(i.ownerRespondedAt) >= ms(i.reopenedAt);
    return answered ? null : new Date(ms(i.reopenedAt));
  }
  return i.acknowledgedAt || i.ownerRespondedAt ? null : new Date(ms(i.createdAt));
}

/** The one definition of "needs a response", used by the issue lists, the dashboard and the tab badges. */
export function issueNeedsResponse(i: ResponseFacts, now: Date): boolean {
  const since = awaitingReplySince(i);
  return since !== null && now.getTime() - since.getTime() > RESPONSE_DUE_HOURS * 3_600_000;
}

// ---------------------------------------------------------------------------
// Plan changes: credits for unused paid days

/** Days in a bill's period, how many were used before a switch on `on`, and how many are left from `on`. */
export function splitPeriod(start: ISODate, end: ISODate, on: ISODate) {
  const periodDays = daysBetween(start, end) + 1;
  const usedDays = Math.min(periodDays, Math.max(0, daysBetween(start, on)));
  return { periodDays, usedDays, unusedDays: periodDays - usedDays };
}

/** `amount` scaled to `days` of a `periodDays`-day period, in whole rupees. */
export function prorate(amount: number, days: number, periodDays: number): number {
  if (periodDays <= 0 || amount <= 0) return 0;
  return Math.round((amount * Math.min(Math.max(days, 0), periodDays)) / periodDays);
}

/** What a credit line on a plan bill says. */
export function creditNote(fromPlan: OwnerPlanTier, from: ISODate, to: ISODate) {
  return `Credit for unused ${OWNER_PLANS[fromPlan].label} days (${shortDate(from)} – ${shortDate(to)})`;
}

/** What a bill cut short by an upgrade says. */
export function usedDaysNote(plan: OwnerPlanTier, from: ISODate, to: ISODate) {
  return `${OWNER_PLANS[plan].label} days used before the upgrade (${shortDate(from)} – ${shortDate(to)})`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso: ISODate) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

/** The day an unpaid plan bill pauses the hostel's paid features: the first day it is more than 15 days past due. */
export const pausesOn = (dueDate: ISODate) => addDays(dueDate, OWNER_DOWNGRADE_DAYS + 1);
/** The first day an unpaid bill shows as overdue. */
export const overdueFrom = (dueDate: ISODate) => addDays(dueDate, OVERDUE_GRACE_DAYS + 1);

// ---------------------------------------------------------------------------
// What each plan gives and costs (the for-owners page, the plan page and the app all show this)

export const OWNER_PLAN_FEATURES: Record<OwnerPlanTier, { tagline: string; features: string[] }> = {
  free: {
    tagline: 'Get found',
    features: [
      'Listing with photos, map pin, rooms, rent and free beds',
      'Visit requests, with call and WhatsApp buttons',
      'Reviews from residents who subscribed through Hostels',
      'Residents can report issues and you can answer them',
    ],
  },
  pro: {
    tagline: 'Run your hostel',
    features: [
      'Everything in Free',
      'Resident register: add residents by phone, they accept in the app',
      'Rent tracker: who paid this month and who still owes, in rupees',
      'Community board with pinned announcements',
      'Public replies to reviews',
      'Occupancy by room, page views and the month’s money on your dashboard',
    ],
  },
  partner: {
    tagline: 'Join the Hostels brand',
    features: [
      'Everything in Pro',
      '“Verified partner” badge and priority in search',
      'Residents subscribe and pay online, with no advance',
      'Weekly menus, meal skips and a daily kitchen headcount',
      'Monthly payouts of what subscribers paid, less the platform fee',
      'Brand kit: signboard, poster and door sticker with your hostel’s name',
    ],
  },
};

/** One line per plan: the price, as the plan page and the for-owners page print it. */
export function planPriceLine(tier: OwnerPlanTier) {
  const price = OWNER_PLANS[tier].price;
  if (!price) return '₹0 a month';
  return tier === 'partner'
    ? `${formatRupees(price)} a month + ${DEFAULT_PLATFORM_FEE_PCT}% of subscriber bills paid through Hostels`
    : `${formatRupees(price)} a month`;
}

const trial = OWNER_TRIAL_MONTHS === 1 ? 'first month' : `first ${OWNER_TRIAL_MONTHS} months`;

/** How owner billing works, in the order an owner meets it. Every number comes from `pricing.ts`. */
export const OWNER_BILLING_RULES: string[] = [
  `Plans are per hostel and billed monthly. Pro and Partner are free for the ${trial}, once per hostel.`,
  `Each bill is ready ${INVOICE_LEAD_DAYS} days before its month starts and is due on the first day of that month.`,
  `A bill unpaid ${OVERDUE_GRACE_DAYS} days after its due date shows as overdue. At ${OWNER_DOWNGRADE_DAYS} days overdue the hostel drops to the Free features: your listing, residents and records stay, and everything comes back the moment you pay.`,
  'An upgrade starts the new plan that day, and its first bill is due that day. You never pay twice for the same days: what you already paid for the rest of the month comes off that bill.',
  'Downgrades and cancellations take effect at the end of the month you paid for.',
];

/** What a "Verified partner" badge requires: an in-person visit that checks each of these. */
export const PARTNER_REQUIREMENTS = {
  intro: 'A live listing, then an in-person visit from the Hostels team. The badge appears only when every check passes:',
  checks: PARTNER_STANDARDS.map((s) => ('foodOnly' in s && s.foodOnly ? `${s.label} (hostels that serve food)` : s.label)),
};

// ---------------------------------------------------------------------------
// The next step for each hostel on the owner's home screen

export type OwnerSection = 'listing' | 'rooms' | 'plan' | 'issues' | 'dashboard';
export type NextStep = { tone: 'ok' | 'info' | 'warn' | 'danger'; text: string; action: { label: string; section: OwnerSection } | null };

export type NextStepInput = {
  status: HostelStatus;
  rejectionReason: string | null;
  partnerStatus: PartnerStatus;
  rooms: number;
  photos: number;
  plan: { plan: OwnerPlanTier; suspended: boolean };
  /** The oldest unpaid plan bill, if any. */
  unpaidBill?: { amount: number; dueDate: ISODate } | null;
  /** Issues waiting for the hostel's first answer for more than a day. */
  needsResponse?: number;
};

/** One clear next step per hostel, so no state on the owner's home is a dead end. */
export function ownerNextStep(h: NextStepInput, today: ISODate): NextStep {
  if (h.plan.suspended) {
    return {
      tone: 'danger',
      text: `Paid features are paused: a plan bill is more than ${OWNER_DOWNGRADE_DAYS} days overdue. Your listing and records are safe; paying turns everything back on at once.`,
      action: { label: 'Pay the bill', section: 'plan' },
    };
  }
  if (h.status === 'rejected') {
    return {
      tone: 'danger',
      text: `Not approved${h.rejectionReason ? `: ${h.rejectionReason}` : ''}. Fix the listing and send it again.`,
      action: { label: 'Fix the listing', section: 'listing' },
    };
  }
  if (h.status === 'draft') {
    if (!h.rooms) return { tone: 'info', text: 'Draft. Add your rooms and rent next.', action: { label: 'Add rooms', section: 'rooms' } };
    if (!h.photos) return { tone: 'info', text: 'Draft. Add at least one photo next.', action: { label: 'Add photos', section: 'listing' } };
    return { tone: 'info', text: 'Draft, ready to go. Send it for review; we usually approve within a day.', action: { label: 'Send for review', section: 'listing' } };
  }
  if (h.status === 'pending') {
    return { tone: 'info', text: 'In review. We usually approve within a day; you can keep editing meanwhile.', action: null };
  }
  if (h.needsResponse) {
    const n = h.needsResponse;
    return {
      tone: 'warn',
      text: `${n} ${n === 1 ? 'issue has' : 'issues have'} waited more than ${RESPONSE_DUE_HOURS} hours for your reply. Response times show on your public listing.`,
      action: { label: 'Answer issues', section: 'issues' },
    };
  }
  if (h.unpaidBill) {
    const pause = pausesOn(h.unpaidBill.dueDate);
    const late = today >= overdueFrom(h.unpaidBill.dueDate);
    return {
      tone: late ? 'warn' : 'info',
      text: `${late ? 'Overdue' : 'Plan bill due'}: ${formatRupees(h.unpaidBill.amount)}, due ${shortDate(h.unpaidBill.dueDate)}. Unpaid on ${shortDate(pause)}, paid features pause.`,
      action: { label: 'Pay now', section: 'plan' },
    };
  }
  if (h.partnerStatus === 'applied') {
    return { tone: 'info', text: "Partner application in review. We'll call you to schedule the visit.", action: { label: 'See the checklist', section: 'plan' } };
  }
  return { tone: 'ok', text: 'Live. Keep free beds current so people call when you have room.', action: { label: 'Update beds', section: 'rooms' } };
}

// ---------------------------------------------------------------------------
// Residents

/** A stay the owner ended with a date ahead stays active until then; the roster says so. */
export function residencyLabel(r: { status: ResidencyStatus; endDate: ISODate | null }, today: ISODate): string {
  if (r.status === 'active' && r.endDate && r.endDate >= today) return `Leaving on ${shortDate(r.endDate)}`;
  return { invited: 'Invited', active: 'Living here', ended: 'Moved out', declined: 'Declined' }[r.status];
}

// ---------------------------------------------------------------------------
// Visit requests

/** new → contacted → closed, and new may close straight away. Closed is final: a withdrawn request never reopens. */
export const VISIT_NEXT: Record<VisitStatus, VisitStatus[]> = { new: ['contacted', 'closed'], contacted: ['closed'], closed: [] };
export const VISIT_ACTION_LABEL: Record<VisitStatus, string> = { new: 'Mark new', contacted: 'Mark contacted', closed: 'Close' };
