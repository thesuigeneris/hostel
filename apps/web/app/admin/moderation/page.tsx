import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Empty, Flash, Input, PageHeader, Stars } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { hideReviewAction } from '../actions';

export default async function AdminModeration({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const q = await searchParams;
  const client = await api();
  const [flagged, reports] = await Promise.all([client.admin.flaggedReviews(), client.admin.reports()]);
  return (
    <>
      <PageHeader title="Moderation" subtitle="Hide reviews only when they break the rules: abuse, personal details, or clearly not about a stay. A bad rating alone is not a reason." />
      <Flash error={q.error} ok={q.ok} />
      <h2 className="mb-3 text-lg font-semibold">Flagged reviews</h2>
      {flagged.length === 0 ? <Empty title="No flagged reviews" /> : (
        <div className="space-y-3">
          {flagged.map((f) => (
            <Card key={f.review.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm"><span className="font-medium">{f.review.author}</span> on <span className="font-medium">{f.hostelName}</span> · {f.flags} flag{f.flags === 1 ? '' : 's'}</div>
                <Stars value={f.review.rating} />
              </div>
              <p className="mt-2 text-sm">{f.review.body}</p>
              <ul className="mt-2 list-disc pl-5 text-xs text-ink-muted">{f.reasons.map((r, i) => <li key={`${i}-${r}`}>{r}</li>)}</ul>
              <form action={hideReviewAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={f.review.id} />
                {f.review.hidden ? (
                  <><input type="hidden" name="unhide" value="1" /><SubmitButton size="sm" variant="secondary">Unhide</SubmitButton></>
                ) : (
                  <><Input name="reason" placeholder="Reason" className="h-8 max-w-xs" /><SubmitButton size="sm" variant="danger">Hide review</SubmitButton></>
                )}
              </form>
            </Card>
          ))}
        </div>
      )}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Reported community posts</h2>
      {reports.length === 0 ? <Empty title="No open reports" /> : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Card key={r.id} className="p-4 text-sm">
              <span className="font-medium">{r.targetType}</span> in {r.hostelName} · {timeAgo(r.createdAt)}: {r.reason}{' '}
              <Link href={`/owner/hostels/${r.hostelId}/community`}>Open the board</Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
