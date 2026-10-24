import Link from 'next/link';
import { REVIEW_STATUSES, type ReviewStatus } from '@hostels/shared';
import { ReviewModeration } from '@/components/admin/actions';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { FilterChip } from '@/components/owner/filter-chip';
import { Pager } from '@/components/owner/pager';
import { ReviewCard } from '@/components/owner/review-card';
import { LoadError } from '@/components/owner/ui';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminReviews({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = (REVIEW_STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as ReviewStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const api = await serverApi();
  const res = await load(() => api.admin.reviews({ status, page }));
  const qs = (s?: string, p?: number) => {
    const q = new URLSearchParams();
    if (s) q.set('status', s);
    if (p && p > 1) q.set('page', String(p));
    return `?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Reviews" subtitle="Hide reviews that are abusive, off-topic or share personal details. Hidden reviews are excluded from ratings." />
      <div className="mb-4 flex gap-2">
        <FilterChip href={qs()} active={!status}>
          All
        </FilterChip>
        <FilterChip href={qs('published')} active={status === 'published'}>
          Published
        </FilterChip>
        <FilterChip href={qs('hidden')} active={status === 'hidden'}>
          Hidden
        </FilterChip>
      </div>
      {res.error !== null ? (
        <LoadError message={res.error} />
      ) : res.data.items.length === 0 ? (
        <EmptyState title="No reviews" />
      ) : (
        <>
          <div className="space-y-3">
            {res.data.items.map((r) => (
              <ReviewCard
                key={r.id}
                review={r}
                header={
                  <Link href={`/hostels/${r.hostel.slug}`} className="text-xs font-medium text-brand hover:underline">
                    {r.hostel.name}
                  </Link>
                }
                footer={<ReviewModeration reviewId={r.id} status={r.status} />}
              />
            ))}
          </div>
          <Pager page={res.data.page} pageSize={res.data.pageSize} total={res.data.total} href={(p) => qs(status, p)} />
        </>
      )}
    </div>
  );
}
