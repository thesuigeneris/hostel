import { ButtonLink } from '@/components/ui/button';
import { Stars } from '@/components/ui/stars';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { HostelPicker } from '@/components/owner/hostel-picker';
import { ReviewCard } from '@/components/owner/review-card';
import { ReviewReply } from '@/components/owner/review-reply';
import { LoadError } from '@/components/owner/ui';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OwnerReviewsPage({ searchParams }: { searchParams: Promise<{ hostelId?: string; filter?: string }> }) {
  const sp = await searchParams;
  const api = await serverApi();
  const hostels = await load(() => api.owner.hostels());
  if (hostels.error !== null) return <LoadError message={hostels.error} />;
  if (hostels.data.length === 0) return <EmptyState title="No hostels yet" action={<ButtonLink href="/owner/hostels/new">Add a hostel</ButtonLink>} />;
  const hostelId = hostels.data.some((h) => h.id === sp.hostelId) ? sp.hostelId! : hostels.data[0]!.id;
  const reviews = await load(() => api.owner.reviews(hostelId));

  const list = reviews.data ?? [];
  const avg = list.length ? list.reduce((s, r) => s + r.overall, 0) / list.length : null;
  const unreplied = list.filter((r) => !r.ownerReply).length;

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle={
          avg !== null ? (
            <span className="inline-flex items-center gap-2">
              <Stars value={avg} /> {avg.toFixed(1)} from {list.length} verified residents · {unreplied} awaiting your reply
            </span>
          ) : (
            'Reviews from verified residents appear here.'
          )
        }
        actions={<HostelPicker hostels={hostels.data} value={hostelId} />}
      />
      {reviews.error !== null ? (
        <LoadError message={reviews.error} />
      ) : list.length === 0 ? (
        <EmptyState title="No reviews yet">Invite your residents to join your hostel on Hostels and share their experience.</EmptyState>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <ReviewCard key={r.id} review={r} footer={<ReviewReply reviewId={r.id} existing={r.ownerReply} />} />
          ))}
        </div>
      )}
    </div>
  );
}
