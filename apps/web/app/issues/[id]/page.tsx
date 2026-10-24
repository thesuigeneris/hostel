import { ApiError, type IssueStatus } from '@hostels/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { updateIssueAction, upvoteAction } from '@/app/stay/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Badge, Card, Flash, PageHeader, StatusBadge, Textarea } from '@/components/ui';
import { api, requireUser } from '@/lib/api';
import { dateLabel, timeAgo, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Issue', robots: { index: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

const OWNER_NEXT: Record<IssueStatus, IssueStatus[]> = {
  open: ['acknowledged', 'in_progress', 'resolved'],
  acknowledged: ['in_progress', 'resolved'],
  in_progress: ['resolved'],
  resolved: [],
  closed: [],
};

export default async function IssuePage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const path = `/issues/${id}`;
  const user = await requireUser(path);
  const client = await api();
  const issue = await client.resident.issue(id).catch((e) => {
    if (e instanceof ApiError && [403, 404].includes(e.status)) notFound();
    throw e;
  });
  const owned = user.role !== 'tenant' && (await client.owner.hostels().catch(() => [])).some((h) => h.id === issue.hostelId);
  const ownerMoves = owned || user.role === 'admin' ? OWNER_NEXT[issue.status] : [];
  const reporterMoves: IssueStatus[] = issue.mine && issue.status === 'resolved' ? ['closed', 'open'] : [];
  const moveLabel: Record<string, string> = {
    acknowledged: 'Acknowledge', in_progress: 'Start work', resolved: 'Mark resolved', closed: 'Confirm fixed', open: 'Still broken, reopen',
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={issue.title} subtitle={<>{titleCase(issue.category)} · reported by {issue.reporter?.name ?? 'a resident'} on {dateLabel(issue.createdAt)}</>} actions={<StatusBadge kind="issue" status={issue.status} />} />
      <Flash error={q.error} ok={q.ok} />
      <Card>
        {issue.description && <p className="whitespace-pre-line text-sm">{issue.description}</p>}
        {issue.photoUrl && <img src={issue.photoUrl} alt={issue.title} className="mt-3 max-h-96 rounded-xl object-cover" />}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span>{issue.upvotes} {issue.upvotes === 1 ? 'person has' : 'people have'} this too</span>
          {!issue.mine && !owned && issue.status !== 'closed' && (
            <form action={upvoteAction}>
              <Back to={path} />
              <input type="hidden" name="issueId" value={id} />
              <input type="hidden" name="on" value={issue.upvotedByMe ? '0' : '1'} />
              <SubmitButton size="sm" variant="secondary">{issue.upvotedByMe ? 'Remove me-too' : 'Me too'}</SubmitButton>
            </form>
          )}
          {issue.needsResponse && <Badge tone="red">Waiting on the hostel</Badge>}
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Updates</h2>
      <ol className="space-y-3">
        {issue.updates.map((u) => (
          <li key={u.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{u.author}</span>
              {u.byOwner && <Badge tone="green">Hostel</Badge>}
              {u.toStatus && <span className="text-ink-muted">moved it to <StatusBadge kind="issue" status={u.toStatus} /></span>}
              <span className="text-xs text-ink-muted">{timeAgo(u.createdAt)}</span>
            </div>
            {u.message && <p className="mt-1 whitespace-pre-line">{u.message}</p>}
          </li>
        ))}
        {issue.updates.length === 0 && <li className="text-sm text-ink-soft">No updates yet.</li>}
      </ol>

      {issue.status !== 'closed' && (
        <Card className="mt-6">
          <form action={updateIssueAction} className="space-y-3">
            <Back to={path} />
            <input type="hidden" name="issueId" value={id} />
            <Textarea name="message" maxLength={1000} placeholder={owned ? 'Tell residents what you are doing about it' : 'Add a comment'} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="secondary" name="status" value="">Comment</SubmitButton>
              {[...ownerMoves, ...reporterMoves].map((s) => (
                <SubmitButton key={s} name="status" value={s} variant={s === 'open' ? 'ghost' : 'primary'}>{moveLabel[s]}</SubmitButton>
              ))}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
