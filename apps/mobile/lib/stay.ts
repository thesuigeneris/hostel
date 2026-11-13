import {
  canReopen,
  commentInputSchema,
  dateLabel,
  type IssueStatus,
  MEAL_LABEL,
  type MenuDay,
  type MyResidency,
  postInputSchema,
  type ReviewInput,
  reviewInputSchema,
  rupees,
  skipCreditText,
  skipCutoffText,
  TEXT_LIMITS,
  textLength,
  weekday,
} from '@hostels/shared';

/** Splits residencies the way My Stay shows them: invites to answer, where you live now, and places you've lived. */
export function groupStays(stays: MyResidency[]) {
  return {
    invites: stays.filter((s) => s.status === 'invited'),
    current: stays.filter((s) => s.status === 'active'),
    past: stays.filter((s) => s.status === 'ended'),
  };
}

export const HOME_TABS = ['community', 'issues', 'neighbours', 'review'] as const;
export type HomeTab = (typeof HOME_TABS)[number];
/** After moving out: the issues you reported (read-only) and your review. */
export const PAST_TABS: HomeTab[] = ['issues', 'review'];

export function tabsFor(active: boolean): HomeTab[] {
  return active ? [...HOME_TABS] : PAST_TABS;
}

/** The hostel-life tab to open: the one asked for if it applies, else Community (or Review after moving out). */
export function pickTab(asked: string | undefined, active: boolean): HomeTab {
  const tabs = tabsFor(active);
  return (tabs as string[]).includes(asked ?? '') ? (asked as HomeTab) : active ? 'community' : 'review';
}

export type IssueMove = { status: IssueStatus; label: string; primary: boolean };

const OWNER_NEXT: Record<IssueStatus, IssueStatus[]> = {
  open: ['acknowledged', 'in_progress', 'resolved'],
  acknowledged: ['in_progress', 'resolved'],
  in_progress: ['resolved'],
  resolved: [],
  closed: [],
};
const MOVE_LABEL: Record<IssueStatus, string> = {
  acknowledged: 'Acknowledge',
  in_progress: 'Start work',
  resolved: 'Mark resolved',
  closed: 'Yes, fixed',
  open: 'Still broken',
};

type IssueState = { status: IssueStatus; mine: boolean; readOnly?: boolean; resolvedAt?: string | null };

/**
 * Status buttons on an issue: the hostel moves it forward; the reporter confirms a resolved one, and can reopen it
 * only within 7 days of the fix (the API refuses later). A reporter who moved out gets none.
 */
export function issueMoves(issue: IssueState, canManage: boolean, now: number = Date.now()): IssueMove[] {
  const moves = canManage ? OWNER_NEXT[issue.status] : [];
  const reporter: IssueStatus[] =
    issue.mine && !issue.readOnly && issue.status === 'resolved'
      ? canReopen({ status: issue.status, resolvedAt: issue.resolvedAt ?? null }, now)
        ? ['closed', 'open']
        : ['closed']
      : [];
  return [...moves, ...reporter].map((s) => ({ status: s, label: MOVE_LABEL[s], primary: s !== 'open' }));
}

export type Scores = { rating: number; cleanliness: number; food: number | null; safety: number; responsiveness: number };
export const DEFAULT_SCORES: Scores = { rating: 4, cleanliness: 4, food: null, safety: 4, responsiveness: 4 };

/** The form starts from your existing review, so editing changes it rather than starting over. */
export function scoresFrom(review: MyResidency['review']): Scores {
  if (!review) return DEFAULT_SCORES;
  const { rating, cleanliness, food, safety, responsiveness } = review;
  return { rating, cleanliness, food, safety, responsiveness };
}

/** Builds the review to send, or the first problem to show. Same rules as the API. */
export function buildReview(scores: Scores, body: string): { ok: true; input: ReviewInput } | { ok: false; error: string } {
  const parsed = reviewInputSchema.safeParse({ ...scores, body });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your review' };
  return { ok: true, input: parsed.data };
}

/** "120/1,000" as people count characters (an emoji is one), for a counter under a text box. */
export function charCount(text: string, max: number): string {
  return `${textLength(text.trim()).toLocaleString('en-IN')}/${max.toLocaleString('en-IN')}`;
}

/** The API's reason a post or reply would be refused, or null when it is fine to send. */
export function textProblem(kind: 'post' | 'reply', text: string): string | null {
  const parsed = kind === 'post' ? postInputSchema.safeParse({ body: text }) : commentInputSchema.safeParse({ body: text });
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Check the text');
}

export const POST_LIMIT = TEXT_LIMITS.post;
export const REPLY_LIMIT = TEXT_LIMITS.comment;

type Meal = MenuDay['meals'][number];

/** What a meal's skip button says and when it locks, in IST, with a full name for screen readers. */
export function skipControl(day: MenuDay, m: Meal) {
  const what = `${MEAL_LABEL[m.meal].toLowerCase()} on ${weekday(day.date)} ${dateLabel(day.date)}`;
  const title = m.skipped ? 'Undo skip' : `Skip (${skipCreditText(m.credit)})`;
  return {
    title,
    a11y: `${title}: ${what}`,
    until: m.canChange ? `until ${skipCutoffText(day.date, m.cutoff)}` : `locked since ${skipCutoffText(day.date, m.cutoff)}`,
    skippedNote: m.credit > 0 ? `Skipped · −${rupees(m.credit)}` : 'Skipped · no credit',
  };
}
