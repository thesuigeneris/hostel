'use client';
import { useState } from 'react';
import type { IssueStatus } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Field, FormError, Input, Textarea } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { useAction } from './use-action';

/** Owner-allowed transitions (addendum §4). Admin may additionally confirm/reopen. */
const OWNER_NEXT: Record<IssueStatus, { to: IssueStatus; label: string }[]> = {
  open: [
    { to: 'acknowledged', label: 'Acknowledge' },
    { to: 'in_progress', label: 'Start work' },
    { to: 'resolved', label: 'Mark resolved' },
  ],
  acknowledged: [
    { to: 'in_progress', label: 'Start work' },
    { to: 'resolved', label: 'Mark resolved' },
  ],
  in_progress: [{ to: 'resolved', label: 'Mark resolved' }],
  resolved: [],
  closed: [],
};
const ADMIN_EXTRA: Partial<Record<IssueStatus, { to: IssueStatus; label: string }[]>> = {
  resolved: [
    { to: 'closed', label: 'Close' },
    { to: 'open', label: 'Reopen' },
  ],
};

export function IssueStatusActions({ issueId, status, asAdmin }: { issueId: string; status: IssueStatus; asAdmin?: boolean }) {
  const [note, setNote] = useState('');
  const { run, pending, error } = useAction();
  const options = [...OWNER_NEXT[status], ...(asAdmin ? (ADMIN_EXTRA[status] ?? []) : [])];
  if (options.length === 0)
    return <p className="text-sm text-muted">{status === 'resolved' ? 'Waiting for the resident to confirm the fix.' : 'This issue is closed.'}</p>;
  return (
    <div className="space-y-3">
      <Field label="Note to resident (optional)" hint="Saved as a comment with the status change.">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Plumber booked for 4pm today" maxLength={2000} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button
            key={o.to}
            size="sm"
            variant={o.to === 'resolved' ? 'primary' : 'secondary'}
            loading={pending === o.to}
            disabled={!!pending}
            onClick={async () => {
              const out = await run(o.to, () => api.community.setIssueStatus(issueId, { status: o.to, note: note.trim() || undefined }));
              if (out) setNote('');
            }}
          >
            {o.label}
          </Button>
        ))}
      </div>
      <FormError message={error} />
    </div>
  );
}

export function IssueCommentForm({ issueId }: { issueId: string }) {
  const [body, setBody] = useState('');
  const { run, pending, error } = useAction();
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const out = await run('comment', () => api.community.commentIssue(issueId, { body }));
        if (out) setBody('');
      }}
    >
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Reply to the resident…" maxLength={2000} required />
      <FormError message={error} />
      <Button type="submit" size="sm" loading={pending === 'comment'} disabled={!body.trim()}>
        Post reply
      </Button>
    </form>
  );
}
