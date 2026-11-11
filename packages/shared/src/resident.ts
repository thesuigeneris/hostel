import { rupees } from './format';
import { ISSUE_AUTOCLOSE_DAYS, type Meal } from './pricing';
import { istDate } from './time';
import type { IssueStatus } from './types';

/**
 * Helpers for the resident side (names, reviews, issues, meals) shared by the API, the website and the app.
 * Instants are ISO strings in UTC; calendar dates are IST `YYYY-MM-DD`.
 */

/**
 * Length as people count characters. JavaScript's `length` counts UTF-16 units, so one emoji counts as two;
 * code points count it once, and are the same on every engine (grapheme rules differ between them).
 */
export function textLength(text: string): number {
  return Array.from(text).length;
}

/** True when the text has something to read once spaces and invisible joiners are removed. */
export function hasVisibleText(text: string): boolean {
  return /\S/u.test(text.replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, ''));
}

/** A phone number typed as a name. Names are shown to other residents and readers; phone numbers never are. */
const PHONE_LIKE = /^\+?[\d\s\-().]{7,}$/;

/** The first user-perceived character, so an initial never splits an emoji or an accented letter in two. */
function firstGrapheme(word: string): string {
  const Segmenter = (Intl as { Segmenter?: new (locale?: string, opts?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } })
    .Segmenter;
  if (Segmenter) {
    for (const { segment } of new Segmenter(undefined, { granularity: 'grapheme' }).segment(word)) return segment;
  }
  return Array.from(word)[0] ?? '';
}

function nameParts(name: string | null | undefined): string[] {
  const trimmed = (name ?? '').trim();
  if (!trimmed || PHONE_LIKE.test(trimmed)) return [];
  return trimmed.split(/\s+/u).filter(hasVisibleText);
}

/** "Asha" for "Asha Rao"; "Resident" when there is no usable name. */
export function publicFirstName(name: string | null | undefined): string {
  return nameParts(name)[0] ?? 'Resident';
}

/** "Asha R." for "Asha Rao", "राहुल श." for "राहुल शर्मा", "Asha" for a single name, "Resident" for none. */
export function firstNameAndInitial(name: string | null | undefined): string {
  const parts = nameParts(name);
  if (!parts.length) return 'Resident';
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${firstGrapheme(parts[parts.length - 1]!)}.`;
}

/** A save within a minute of writing is the same review, not an edit. */
const EDIT_GRACE_MS = 60_000;

/**
 * Whether a review was edited, and whether that was after the hostel replied: then the reply answers an earlier
 * version, and readers are told so.
 */
export function reviewEdits(r: { createdAt: string; updatedAt: string; ownerRepliedAt: string | null }) {
  const edited = Date.parse(r.updatedAt) - Date.parse(r.createdAt) > EDIT_GRACE_MS;
  const editedAfterReply = edited && !!r.ownerRepliedAt && Date.parse(r.updatedAt) > Date.parse(r.ownerRepliedAt);
  return { edited, editedAfterReply };
}

export const EDITED_AFTER_REPLY = 'Edited after the owner replied';

/** When the reporter can no longer reopen a resolved issue: it closes on its own after this. */
export function reopenDeadline(resolvedAt: string | null): number | null {
  return resolvedAt ? Date.parse(resolvedAt) + ISSUE_AUTOCLOSE_DAYS * 86_400_000 : null;
}

/** The reporter may reopen a resolved issue up to and including the deadline (the API and the close job agree). */
export function canReopen(issue: { status: IssueStatus; resolvedAt: string | null }, now: number = Date.now()): boolean {
  const deadline = reopenDeadline(issue.resolvedAt);
  return issue.status === 'resolved' && deadline !== null && now <= deadline;
}

/** "9:00 am" in IST, whatever time zone the device is in. */
export function istTime(at: string | Date): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60_000);
  const h = ist.getUTCHours();
  const m = ist.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** When a skip can last be changed, in IST: "9:00 am IST", or "10:00 pm IST the night before" for breakfast. */
export function skipCutoffText(mealDate: string, cutoff: string): string {
  const sameDay = istDate(new Date(cutoff)) === mealDate;
  return `${istTime(cutoff)} IST${sameDay ? '' : ' the night before'}`;
}

/** What skipping earns, in words for a button: "save ₹80", or "no credit" when the plan ends before the next bill. */
export function skipCreditText(credit: number): string {
  return credit > 0 ? `save ${rupees(credit)}` : 'no credit';
}

export const NO_CREDIT_REASON = 'No credit — your plan ends before the next bill';

/** Plain words for a meal, for buttons and screen readers. */
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

/** Status names in plain words, for messages ("from in progress to resolved"). */
export const ISSUE_STATUS_WORDS: Record<IssueStatus, string> = {
  open: 'open',
  acknowledged: 'acknowledged',
  in_progress: 'in progress',
  resolved: 'resolved',
  closed: 'closed',
};
