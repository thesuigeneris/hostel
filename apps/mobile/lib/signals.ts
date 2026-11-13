import type { IssueView, MySignals } from '@hostels/shared';

/**
 * In-app signals (product gap 1b, no push): issues I reported with updates I haven't opened. Counted by the API
 * (`/me/signals`, `unreadUpdates` on each of my issues); these turn them into what the screens show.
 */

/** The My Stay tab badge: the number of issues with something new, or nothing at all. */
export function tabBadge(signals: MySignals | null | undefined): number | undefined {
  const n = signals?.issuesWithUpdates ?? 0;
  return n > 0 ? n : undefined;
}

/** How many of my issues at one hostel have new updates. */
export function newUpdatesAt(issues: Pick<IssueView, 'hostelId' | 'unreadUpdates'>[], hostelId: string): number {
  return issues.filter((i) => i.hostelId === hostelId && i.unreadUpdates > 0).length;
}

/** "1 new update", "3 new updates"; null when there are none. */
export function newUpdatesLabel(n: number): string | null {
  return n > 0 ? `${n} new ${n === 1 ? 'update' : 'updates'}` : null;
}
