import type { Issue, IssueStats, IssueStatus } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ISSUE_CATEGORY_LABEL, ISSUE_STATUS_LABEL, hours, timeAgo } from '@/lib/format';

export const ISSUE_TONE: Record<IssueStatus, 'danger' | 'warn' | 'brand' | 'ok' | 'neutral'> = {
  open: 'danger',
  acknowledged: 'warn',
  in_progress: 'brand',
  resolved: 'ok',
  closed: 'neutral',
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return <Badge tone={ISSUE_TONE[status]}>{ISSUE_STATUS_LABEL[status]}</Badge>;
}

/** "How this hostel handles issues": public numbers from the last 90 days. */
export function IssueTransparency({ stats, recent }: { stats: IssueStats; recent: Issue[] }) {
  const pct = stats.last90Days ? Math.round((stats.resolved / stats.last90Days) * 100) : null;
  return (
    <Card className="p-5">
      <h3 className="font-semibold">How this hostel handles issues</h3>
      <p className="mt-1 text-xs text-muted">Reported by residents in the last 90 days</p>
      {stats.last90Days === 0 ? (
        <p className="mt-4 text-sm text-muted">No issues reported in the last 90 days.</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">Reported</dt>
              <dd className="text-xl font-semibold">{stats.last90Days}</dd>
            </div>
            <div>
              <dt className="text-muted">Resolved</dt>
              <dd className="text-xl font-semibold text-ok">{pct}%</dd>
            </div>
            <div>
              <dt className="text-muted">First response</dt>
              <dd className="text-xl font-semibold">{hours(stats.medianResponseHours)}</dd>
            </div>
            <div>
              <dt className="text-muted">Time to fix</dt>
              <dd className="text-xl font-semibold">{hours(stats.medianResolutionHours)}</dd>
            </div>
          </dl>
          {recent.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line">
              {recent.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{i.title}</div>
                    <div className="text-xs text-muted">
                      {ISSUE_CATEGORY_LABEL[i.category]} · {timeAgo(i.createdAt)}
                    </div>
                  </div>
                  <IssueStatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
