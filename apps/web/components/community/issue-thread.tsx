'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { IssueComment, IssueDetail, IssueStatus } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, Textarea } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';
import { ISSUE_STATUS_LABEL, formatDateTime, timeAgo } from '@/lib/format';
import { Avatar } from './post-card';

/** Status timeline, comments and the reporter's confirm/reopen actions. */
export function IssueThread({ issue: initial, viewerId }: { issue: IssueDetail; viewerId: string }) {
  const router = useRouter();
  const [issue, setIssue] = useState(initial);
  const [comments, setComments] = useState<IssueComment[]>(initial.comments);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState<IssueStatus | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isReporter = issue.reporter?.id === viewerId;

  const timeline: { label: string; at: string | null }[] = [
    { label: 'Reported', at: issue.createdAt },
    { label: 'Acknowledged by owner', at: issue.acknowledgedAt },
    { label: 'Marked resolved', at: issue.resolvedAt },
    { label: 'Confirmed fixed', at: issue.closedAt },
  ];

  async function setStatus(status: IssueStatus) {
    setActing(status);
    setError(null);
    try {
      const updated = await api.community.setIssueStatus(issue.id, { status, ...(note.trim() ? { note: note.trim() } : {}) });
      const fresh = await api.community.issue(issue.id).catch(() => null);
      setIssue(fresh ?? { ...issue, ...updated });
      if (fresh) setComments(fresh.comments);
      setNote('');
      router.refresh();
    } catch (e) {
      setError(describeError(e).message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        {issue.status === 'resolved' && isReporter && (
          <Card className="border-ok bg-ok-soft/50 p-4">
            <div className="font-medium">The owner says this is fixed. Is it?</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" className="mt-3 min-h-14 bg-surface" maxLength={2000} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button loading={acting === 'closed'} onClick={() => void setStatus('closed')}>
                Yes, it&apos;s fixed
              </Button>
              <Button variant="secondary" loading={acting === 'open'} onClick={() => void setStatus('open')}>
                No, reopen it
              </Button>
            </div>
          </Card>
        )}
        <FormError message={error} />

        <div className="space-y-3">
          <h2 className="font-semibold">Updates</h2>
          {comments.length === 0 && <p className="text-sm text-muted">No updates yet. The owner has been notified.</p>}
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar name={c.author.name} />
              <Card className={c.isOwner ? 'flex-1 border-brand bg-brand-soft/40 p-3' : 'flex-1 p-3'}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{c.author.name}</span>
                  {c.isOwner && <Badge tone="brand">Owner</Badge>}
                  <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{c.body}</p>
              </Card>
            </div>
          ))}
          {issue.status !== 'closed' && (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                setSending(true);
                setError(null);
                try {
                  const c = await api.community.commentIssue(issue.id, { body: draft.trim() });
                  setComments((cs) => [...cs, c]);
                  setDraft('');
                } catch (err) {
                  setError(describeError(err).message);
                } finally {
                  setSending(false);
                }
              }}
            >
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add an update or more detail" maxLength={2000} />
              <Button type="submit" size="sm" loading={sending} disabled={!draft.trim()}>
                Comment
              </Button>
            </form>
          )}
        </div>
      </div>

      <aside>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
          <ol className="space-y-3">
            {timeline.map((t) => (
              <li key={t.label} className="flex gap-3 text-sm">
                <span className={t.at ? 'mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand' : 'mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-line'} />
                <div>
                  <div className={t.at ? 'font-medium' : 'text-muted'}>{t.label}</div>
                  {t.at && <div className="text-xs text-muted">{formatDateTime(t.at)}</div>}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t border-line pt-3 text-xs text-muted">Current status: {ISSUE_STATUS_LABEL[issue.status]}</div>
        </Card>
      </aside>
    </div>
  );
}
