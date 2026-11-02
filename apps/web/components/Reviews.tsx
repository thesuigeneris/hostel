import type { Review } from '@hostels/shared';
import { flagReviewAction } from '@/app/hostels/[slug]/actions';
import { dateLabel, monthLabel, reviewSource } from '@/lib/format';
import { SubmitButton } from './SubmitButton';
import { Badge, Card, cx, focusRing, Select, Stars } from './ui';

export const FLAG_REASONS = ['Looks fake or not a real stay', 'Abusive or hateful', 'Shares personal data', 'Off-topic or spam'];

/** A save within a minute of writing is the same review, not an edit. */
const edited = (r: Review) => Date.parse(r.updatedAt) - Date.parse(r.createdAt) > 60_000;

/** One resident review: how the stay was confirmed, when, the sub-ratings and the hostel's dated reply. */
export function ReviewCard({ r, slug, canFlag }: { r: Review; slug: string; canFlag: boolean }) {
  const source = reviewSource(r.verifiedVia);
  const subs: [string, number | null][] = [
    ['Cleanliness', r.cleanliness],
    ['Food', r.food],
    ['Safety', r.safety],
    ['Owner response', r.responsiveness],
  ];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{r.author}</span>
            <Badge tone={source.strong ? 'green' : 'gray'}>{source.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {r.stay && <>Lived here {monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'} · </>}
            Written {dateLabel(r.createdAt)}
            {edited(r) && ` · edited ${dateLabel(r.updatedAt)}`}
          </p>
        </div>
        <Stars value={r.rating} />
      </div>
      <p className="mt-3 whitespace-pre-line text-sm text-ink-soft [overflow-wrap:anywhere]">{r.body}</p>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {subs
          .filter(([, v]) => v !== null)
          .map(([label, v]) => (
            <div key={label} className="flex gap-1">
              <dt>{label}</dt>
              <dd className="font-medium tabular-nums text-ink">{v}/5</dd>
            </div>
          ))}
      </dl>
      {r.ownerReply && (
        <div className="mt-3 rounded-xl bg-bg p-3 text-sm">
          <p className="text-xs font-medium text-ink">
            Reply from the hostel
            {r.ownerRepliedAt && (
              <span className="font-normal text-ink-muted">
                {' '}· {dateLabel(r.ownerRepliedAt)}
                {r.ownerReplyEditedAt && ` · edited ${dateLabel(r.ownerReplyEditedAt)}`}
              </span>
            )}
          </p>
          <p className="mt-1 whitespace-pre-line text-ink-soft [overflow-wrap:anywhere]">{r.ownerReply}</p>
        </div>
      )}
      {canFlag && (
        <details className="mt-2 text-xs">
          <summary className={cx('inline-flex min-h-6 cursor-pointer items-center rounded text-ink-muted hover:text-danger', focusRing)}>Report this review</summary>
          <form action={flagReviewAction} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="reviewId" value={r.id} />
            <Select name="reason" defaultValue={FLAG_REASONS[0]} className="h-9 w-auto" aria-label="Why are you reporting this review?">
              {FLAG_REASONS.map((x) => <option key={x}>{x}</option>)}
            </Select>
            <SubmitButton size="sm" variant="secondary">Send to our team</SubmitButton>
          </form>
        </details>
      )}
    </Card>
  );
}
