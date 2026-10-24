import { replyReviewAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Badge, Card, Empty, Flash, Stars, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { monthLabel } from '@/lib/format';
import { ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

export default async function OwnerReviewsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const h = await ownerHostel(id);
  const reviews = await (await api()).owner.reviews(id);
  const path = `/owner/hostels/${id}/reviews`;

  return (
    <div className="space-y-4">
      <Flash error={q.error} ok={q.ok} />
      <p className="text-sm text-ink-soft">
        Only verified residents can review, after two weeks of stay. You can&apos;t remove reviews, but a calm, specific reply goes a long way.
        {h.ratings.rating !== null && <> Current rating: <Stars value={h.ratings.rating} /> from {h.ratings.reviewCount}.</>}
      </p>
      {reviews.length === 0 && <Empty title="No reviews yet">Add residents (Pro) or take subscriptions (Partner) so they can review.</Empty>}
      {reviews.map((r) => (
        <Card key={r.id} className={r.hidden ? 'opacity-60' : ''}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.author}</span>
              {r.stay && <span className="text-xs text-ink-muted">{monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'}</span>}
              {r.hidden && <Badge tone="red">Hidden by moderators</Badge>}
            </div>
            <Stars value={r.rating} />
          </div>
          <div className="mt-1 text-xs text-ink-muted">Cleanliness {r.cleanliness} · Food {r.food ?? '—'} · Safety {r.safety} · Response {r.responsiveness}</div>
          <p className="mt-2 text-sm">{r.body}</p>
          <form action={replyReviewAction} className="mt-3 space-y-2">
            <Back to={path} />
            <input type="hidden" name="reviewId" value={r.id} />
            <Textarea name="reply" required minLength={2} maxLength={1000} defaultValue={r.ownerReply ?? ''} placeholder="Reply publicly" className="min-h-16" />
            <SubmitButton size="sm" variant="secondary">{r.ownerReply ? 'Update reply' : 'Reply'}</SubmitButton>
          </form>
        </Card>
      ))}
    </div>
  );
}
