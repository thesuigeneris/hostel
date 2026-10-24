import { ApiError } from '@hostels/shared';
import { Feed, IssueList } from '@/components/Community';
import { Upsell } from '@/components/Upsell';
import { Card, Flash } from '@/components/ui';
import { api } from '@/lib/api';
import { ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

export default async function OwnerCommunityPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const h = await ownerHostel(id);
  const client = await api();
  const path = `/owner/hostels/${id}/community`;
  const [issues, posts] = await Promise.all([
    client.resident.issues(id),
    client.resident.feed(id).catch((e) => (e instanceof ApiError && e.code === 'plan_required' ? null : Promise.reject(e))),
  ]);
  const open = issues.filter((i) => i.status !== 'closed' && i.status !== 'resolved');
  const done = issues.filter((i) => i.status === 'closed' || i.status === 'resolved');

  return (
    <div className="space-y-8">
      <Flash error={q.error} ok={q.ok} />
      <section>
        <h2 className="text-lg font-semibold">Issues from residents</h2>
        {h.transparency ? (
          <p className="mb-3 mt-1 text-sm text-ink-soft">
            Public record: {h.transparency.resolvedPct}% resolved, median first response {h.transparency.medianHoursToFirstResponse ?? '—'} h over the last {h.transparency.windowDays} days. Answering quickly improves it.
          </p>
        ) : (
          <p className="mb-3 mt-1 text-sm text-ink-soft">Your response times appear on your listing once residents report a few issues. Acknowledge each one quickly.</p>
        )}
        <IssueList issues={open} emptyText="No open issues" />
        {done.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-soft">Resolved and closed ({done.length})</summary>
            <div className="mt-2"><IssueList issues={done} /></div>
          </details>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Community board</h2>
        {posts ? <Feed hostelId={id} posts={posts} back={path} isOwner /> : (
          <>
            <Card className="mb-3 text-sm text-ink-soft">Give residents a place to talk, and post announcements everyone sees.</Card>
            <Upsell hostelId={id} plan="pro" feature="The community board" suspended={h.plan.suspended} />
          </>
        )}
      </section>
    </div>
  );
}
