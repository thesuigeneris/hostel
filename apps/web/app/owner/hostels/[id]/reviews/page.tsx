import Link from 'next/link';
import { replyReviewAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Upsell } from '@/components/Upsell';
import { Back, Badge, Card, cx, Empty, Flash, focusRing, Stars, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, monthLabel, reviewSource } from '@/lib/format';
import { hasPlan, ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string; page?: string }> };

const PAGE_SIZE = 20;

export default async function OwnerReviewsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const page = Math.max(1, Math.min(500, Number.parseInt(q.page ?? '1', 10) || 1));
  const h = await ownerHostel(id);
  const reviews = await (await api()).owner.reviews(id, page);
  const canReply = hasPlan(h.plan.effective, 'pro');
  const path = `/owner/hostels/${id}/reviews${page > 1 ? `?page=${page}` : ''}`;

  return (
    <div className="space-y-4">
      <Flash error={q.error} ok={q.ok} />
      <p className="max-w-prose text-sm text-ink-soft">
        Only verified residents can review, after two weeks of stay. You can&apos;t remove reviews, but a calm, specific reply goes a long way. Reviews still
        waiting for your reply come first.
        {h.ratings.rating !== null && (
          <>
            {' '}Current rating: <Stars value={h.ratings.rating} /> from {h.ratings.reviewCount}.
          </>
        )}
      </p>
      {!canReply && reviews.length > 0 && (
        <Upsell hostelId={id} plan="pro" feature="Replying to reviews" suspended={h.plan.suspended} />
      )}
      {reviews.length === 0 &&
        (page > 1 ? (
          <Empty title="No more reviews" action={<Link href={`/owner/hostels/${id}/reviews`}>Back to the newest</Link>} />
        ) : (
          <Empty title="No reviews yet">Residents can review after 14 days. Add residents (Pro) or take subscriptions (Partner) so they can.</Empty>
        ))}
      {reviews.map((r) => {
        const source = reviewSource(r.verifiedVia);
        return (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">{r.author}</span>
                <Badge tone={source.strong ? 'green' : 'gray'}>{source.label}</Badge>
                {r.stay && <span className="text-xs text-ink-muted">{monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'}</span>}
                {r.hidden && <Badge tone="red">Hidden by moderators</Badge>}
                {!r.ownerReply && <Badge tone="food">Waiting for your reply</Badge>}
              </div>
              <Stars value={r.rating} />
            </div>
            <div className="mt-1 text-xs text-ink-muted">
              Written {dateLabel(r.createdAt)} · Cleanliness {r.cleanliness} · Food {r.food ?? '—'} · Safety {r.safety} · Response {r.responsiveness}
            </div>
            <p className="mt-2 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{r.body}</p>
            {r.ownerReply ? (
              <div className="mt-3 rounded-xl bg-bg p-3 text-sm">
                <p className="text-xs font-medium text-ink">
                  Your public reply
                  <span className="font-normal text-ink-muted">
                    {r.ownerRepliedAt && ` · ${dateLabel(r.ownerRepliedAt)}`}
                    {r.ownerReplyEditedAt && ` · edited ${dateLabel(r.ownerReplyEditedAt)}`}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-line text-ink-soft [overflow-wrap:anywhere]">{r.ownerReply}</p>
                {canReply && (
                  <details className="mt-2">
                    <summary className={cx('inline-flex min-h-6 cursor-pointer items-center rounded text-sm text-brand', focusRing)}>Edit reply</summary>
                    <form action={replyReviewAction} className="mt-2 space-y-2">
                      <Back to={path} />
                      <input type="hidden" name="reviewId" value={r.id} />
                      <input type="hidden" name="mode" value="edit" />
                      <Textarea name="reply" required minLength={2} maxLength={1000} defaultValue={r.ownerReply} aria-label={`Edit your reply to ${r.author}`} className="min-h-16" />
                      <p className="text-xs text-ink-muted">Readers will see that the reply was edited, and when.</p>
                      <SubmitButton size="sm" variant="secondary" pendingText="Saving…">Save changes</SubmitButton>
                    </form>
                  </details>
                )}
              </div>
            ) : (
              canReply && (
                <form action={replyReviewAction} className="mt-3 space-y-2">
                  <Back to={path} />
                  <input type="hidden" name="reviewId" value={r.id} />
                  <Textarea name="reply" required minLength={2} maxLength={1000} placeholder="Reply publicly" aria-label={`Reply publicly to ${r.author}`} className="min-h-16" />
                  <SubmitButton size="sm" variant="secondary" pendingText="Posting…">Reply</SubmitButton>
                </form>
              )
            )}
          </Card>
        );
      })}
      {(page > 1 || reviews.length === PAGE_SIZE) && (
        <nav aria-label="Review pages" className="flex justify-between gap-3 text-sm">
          {page > 1 ? <Link href={`/owner/hostels/${id}/reviews${page > 2 ? `?page=${page - 1}` : ''}`}>← Newer</Link> : <span />}
          {reviews.length === PAGE_SIZE && <Link href={`/owner/hostels/${id}/reviews?page=${page + 1}`}>Older →</Link>}
        </nav>
      )}
    </div>
  );
}
