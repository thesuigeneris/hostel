import { z } from 'zod';
import { dateLabel } from './format';
import type { PartnerStandardId } from './owner-admin';
import { PENDING_SUBSCRIPTION_TTL_MINUTES, TRANSPARENCY_MIN_ISSUES, TRANSPARENCY_WINDOW_DAYS } from './pricing';
import { addDays, type ISODate, isValidDate } from './time';

// Rules a seeker meets while searching and judging a hostel. The API, the website and the app read them from here.

/** Reviews a hostel needs before its average is shown. Fewer read "New", so one review can't define a hostel. */
export const RATING_MIN_REVIEWS = 3;

/**
 * Weight of the prior in the shrunk average that ranks hostels by rating: (C·m + sum of ratings) / (C + count),
 * with m the mean of every visible review. A hostel with one 5★ review stays near the mean; fifty reviews speak for
 * themselves. Only the ranking uses it: pages always show the true average with its count.
 */
export const RATING_PRIOR_WEIGHT = 5;

/** Longest search text the API accepts; the forms trim to it. */
export const SEARCH_TEXT_MAX = 80;
/** Characters typed before suggestions are fetched. */
export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_DEFAULT_LIMIT = 6;
/** Area suggestions shown at most, ahead of hostel names. */
export const SUGGEST_MAX_AREAS = 3;

/** A visit can be requested for today up to this many days ahead. */
export const VISIT_MAX_DAYS_AHEAD = 90;

export const suggestSchema = z.object({
  q: z
    .string()
    .trim()
    .min(SUGGEST_MIN_CHARS, `Type at least ${SUGGEST_MIN_CHARS} characters`)
    .max(SEARCH_TEXT_MAX, `Use at most ${SEARCH_TEXT_MAX} characters`),
  limit: z.coerce.number().int().min(1).max(10).default(SUGGEST_DEFAULT_LIMIT),
});
export type SuggestInput = z.input<typeof suggestSchema>;

/** One row in the search box's suggestion list: an area page, or a hostel page. */
export type Suggestion =
  | { kind: 'area'; label: string; slug: string; count: number }
  | { kind: 'hostel'; label: string; slug: string; area: string; isVerified: boolean };
export type Suggestions = { q: string; items: Suggestion[] };

/** Where a suggestion leads. Area links keep the other filters (`keep` is a query string without `?`). */
export function suggestionHref(s: Suggestion, keep = ''): string {
  if (s.kind === 'hostel') return `/hostels/${s.slug}`;
  return `/hostels-in/${s.slug}${keep ? `?${keep}` : ''}`;
}

/** What a screen reader hears for a suggestion, and what the app shows as its second line. */
export function suggestionDetail(s: Suggestion): string {
  if (s.kind === 'area') return `Area · ${s.count} ${s.count === 1 ? 'hostel' : 'hostels'}`;
  return `Hostel · ${s.area}${s.isVerified ? ' · verified partner' : ''}`;
}

/**
 * What our team checked before verifying a partner, from the inspection record: the standards ticked and the day of
 * the decision. Public, so the "Verified partner" label can say what it rests on. The inspector's notes stay private.
 */
export type PartnerCheck = { checkedOn: ISODate | null; checks: PartnerStandardId[] };

/** Why a seeker reports a review. The admin queue shows the reason with the review. */
export const REVIEW_FLAG_REASONS = ['Looks fake or not a real stay', 'Abusive or hateful', 'Shares personal data', 'Off-topic or spam'] as const;

/** How to show a hostel's rating: nothing yet, "New" below the threshold, or the true average with its count. */
export type RatingView = { kind: 'none' } | { kind: 'new'; count: number } | { kind: 'rated'; rating: number; count: number };

export function ratingView(rating: number | null, count: number): RatingView {
  if (!count || rating === null) return { kind: 'none' };
  if (count < RATING_MIN_REVIEWS) return { kind: 'new', count };
  return { kind: 'rated', rating, count };
}

export const reviewCountLabel = (n: number) => `${n} ${n === 1 ? 'review' : 'reviews'}`;

/** "New · 1 review": the label for a hostel below the review threshold. */
export const newRatingLabel = (count: number) => `New · ${reviewCountLabel(count)}`;

export const RATING_NEW_NOTE = `We show an average once a hostel has ${RATING_MIN_REVIEWS} reviews, so a single review can't define it.`;

/** Median hours as people read them: "under 1 h", "5 h", "3 days". */
export function hoursLabel(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return 'under 1 h';
  return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
}

/** Why a hostel page shows no issue record. Honest both ways: few problems, or few residents reporting here. */
export const TRANSPARENCY_HIDDEN_NOTE =
  `We show a hostel’s issue record once residents have reported at least ${TRANSPARENCY_MIN_ISSUES} issues through Hostels in the last ` +
  `${TRANSPARENCY_WINDOW_DAYS} days, so one complaint doesn’t define a hostel. This hostel has fewer than that. That can mean few problems, ` +
  'or few residents using Hostels to report them.';

/** Why a visit date can't be requested, or null. `today` is the IST date. */
export function visitDateProblem(date: string, today: ISODate): string | null {
  if (!isValidDate(date)) return 'Use a YYYY-MM-DD date';
  if (date < today) return 'Pick today or a later date';
  const last = addDays(today, VISIT_MAX_DAYS_AHEAD);
  if (date > last) return `Pick a date in the next ${VISIT_MAX_DAYS_AHEAD} days (by ${dateLabel(last)})`;
  return null;
}

/** A time of day in India as people say it ("6:42 pm"). IST has no daylight saving, so no time-zone data is needed. */
export function istClockTime(at: Date): string {
  const ist = new Date(at.getTime() + (5 * 60 + 30) * 60_000);
  const h = ist.getUTCHours();
  return `${h % 12 || 12}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** When the bed held for an unpaid first bill is released, and whether that time has passed. */
export function bedHold(createdAt: string, now = new Date()): { endsAt: Date; ended: boolean; until: string } {
  const endsAt = new Date(Date.parse(createdAt) + PENDING_SUBSCRIPTION_TTL_MINUTES * 60_000);
  return { endsAt, ended: endsAt.getTime() <= now.getTime(), until: istClockTime(endsAt) };
}

/** A visit request's status in the visitor's words. */
export const VISIT_STATUS_LABEL = { new: 'Requested', contacted: 'Hostel contacted', closed: 'Closed' } as const;

/** What happens next with a visit request, in the visitor's words. */
export function visitNextStep(v: { status: 'new' | 'contacted' | 'closed'; preferredDate: ISODate }, today: ISODate): string {
  if (v.status === 'contacted') return 'The hostel has been in touch about this visit.';
  if (v.status === 'closed') return 'This request is closed. Request again from the hostel page if you still want to visit.';
  if (v.preferredDate < today) return 'The date you asked for has passed without a reply. Withdraw this request and ask for a new date.';
  return 'Sent. The hostel will call you to confirm a time.';
}
