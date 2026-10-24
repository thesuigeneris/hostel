import { getResidencyAt } from '@/components/community/context';
import { JoinPrompt } from '@/components/community/join-prompt';
import { ReviewForm } from '@/components/community/review-form';
import { LoadError } from '@/components/public/load-error';
import { load } from '@/components/public/safe';
import { requireUser, serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ hostelId: string }> }) {
  const { hostelId } = await params;
  await requireUser(`/community/${hostelId}/review`);
  const res = await getResidencyAt(hostelId);
  if (!res || (res.status !== 'active' && res.status !== 'ended')) {
    return <JoinPrompt hostelSlug={res?.hostel.slug} pending={res?.status === 'pending'} />;
  }
  const mine = await load((await serverApi()).community.myReviews());
  if (!mine.ok) return <LoadError message={mine.message} retryHref={`/community/${hostelId}/review`} />;
  const existing = mine.data.find((r) => r.hostelId === hostelId) ?? null;

  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold">{existing ? 'Edit your review' : `Review ${res.hostel.name}`}</h2>
      <p className="mb-4 text-sm text-muted">Be honest and specific. Future residents rely on this.</p>
      <ReviewForm hostelId={hostelId} hostelSlug={res.hostel.slug} servesFood={res.hostel.foodAvailable} existing={existing} />
    </div>
  );
}
