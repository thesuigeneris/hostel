import { type IssueStatus, type MyResidency, type ReviewInput, reviewInputSchema } from '@hostels/shared';

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

/** The hostel-life tab to open: the one asked for if it exists, else Community. Past residents only get Review. */
export function pickTab(asked: string | undefined, active: boolean): HomeTab {
  if (!active) return 'review';
  return (HOME_TABS as readonly string[]).includes(asked ?? '') ? (asked as HomeTab) : 'community';
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

/** Status buttons on an issue: the hostel moves it forward; the reporter confirms or reopens once it is resolved. */
export function issueMoves(issue: { status: IssueStatus; mine: boolean }, canManage: boolean): IssueMove[] {
  const moves = canManage ? OWNER_NEXT[issue.status] : [];
  const reporter: IssueStatus[] = issue.mine && issue.status === 'resolved' ? ['closed', 'open'] : [];
  return [...moves, ...reporter].map((s) => ({ status: s, label: MOVE_LABEL[s], primary: s !== 'open' }));
}

export type Scores = { rating: number; cleanliness: number; food: number | null; safety: number; responsiveness: number };
export const DEFAULT_SCORES: Scores = { rating: 4, cleanliness: 4, food: null, safety: 4, responsiveness: 4 };

/** Builds the review to send, or the first problem to show. Same rules as the API. */
export function buildReview(scores: Scores, body: string): { ok: true; input: ReviewInput } | { ok: false; error: string } {
  const parsed = reviewInputSchema.safeParse({ ...scores, body });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your review' };
  return { ok: true, input: parsed.data };
}
