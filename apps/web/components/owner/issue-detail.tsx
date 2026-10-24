import type { IssueDetail } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { formatDateTime, ISSUE_CATEGORY_LABEL, timeAgo } from '@/lib/format';
import { IssueCommentForm, IssueStatusActions } from './issue-actions';
import { IssueStatusBadge, SeverityBadge } from './ui';

/** Issue thread + timeline + allowed actions, shared by the owner issue desk and the admin console. */
export function IssueDetailView({ issue, asAdmin }: { issue: IssueDetail; asAdmin?: boolean }) {
  const timeline = [
    { label: 'Reported', at: issue.createdAt },
    { label: 'Acknowledged', at: issue.acknowledgedAt },
    { label: 'Resolved', at: issue.resolvedAt },
    { label: 'Closed by resident', at: issue.closedAt },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <IssueStatusBadge status={issue.status} />
              <SeverityBadge severity={issue.severity} />
              <Badge>{ISSUE_CATEGORY_LABEL[issue.category]}</Badge>
              {!issue.isPublic && <Badge tone="warn">Private</Badge>}
              <span className="ml-auto text-sm text-muted">▲ {issue.upvotes} upvotes</span>
            </div>
            <h1 className="text-xl font-semibold">{issue.title}</h1>
            <div className="text-sm text-muted">
              {issue.anonymous || !issue.reporter ? 'Anonymous resident' : issue.reporter.name} · {timeAgo(issue.createdAt)}
            </div>
            <p className="whitespace-pre-wrap text-sm">{issue.description}</p>
            {issue.photoUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {issue.photoUrls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl bg-line">
                    <img src={u} alt="Issue photo" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-semibold">Conversation</h2>
            {issue.comments.length === 0 && <p className="text-sm text-muted">No replies yet. A quick acknowledgement goes a long way.</p>}
            <ul className="space-y-3">
              {issue.comments.map((c) => (
                <li key={c.id} className={`rounded-xl p-3 text-sm ${c.isOwner ? 'bg-brand-soft' : 'bg-bg'}`}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-ink">{c.author.name}</span>
                    {c.isOwner && <Badge tone="brand">Owner</Badge>}
                    {c.author.role === 'admin' && <Badge tone="food">Hostels team</Badge>}
                    <span>{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
            <IssueCommentForm issueId={issue.id} />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-3">
            <h2 className="font-semibold">Update status</h2>
            <IssueStatusActions issueId={issue.id} status={issue.status} asAdmin={asAdmin} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="mb-3 font-semibold">Timeline</h2>
            <ol className="space-y-2 text-sm">
              {timeline.map((t) => (
                <li key={t.label} className="flex items-center justify-between gap-2">
                  <span className={t.at ? 'text-ink' : 'text-muted'}>{t.label}</span>
                  <span className="text-xs text-muted">{t.at ? formatDateTime(t.at) : '—'}</span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
