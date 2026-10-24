import type { Review } from '@hostels/shared';
import { flagReviewAction } from '@/app/hostels/[slug]/actions';
import { dateLabel, monthLabel, reviewSource } from '@/lib/format';
import { Badge, Card, Select, Stars } from './ui';

const FLAG_REASONS = ['Looks fake or not a real stay', 'Abusive or hateful', 'Shares personal data', 'Off-topic or spam'];

const edited = (r: Review) => Date.parse(r.updatedAt) - Date.parse(r.createdAt) > 60_000;

/** One verified review, with its sub-ratings, the stay it comes from and the hostel's public reply. */
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
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{r.author}</span>
            <Badge tone="green">✓ Verified resident</Badge>
          </div>
          <div className="mt-1 text-xs text-ink-muted">
            {r.stay && <>Lived here {monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'} · </>}
            {source.strong ? 'Stay paid through Hostels' : 'Added by the hostel and confirmed by the resident'} · {dateLabel(r.createdAt)}
            {edited(r) && ` · edited ${dateLabel(r.updatedAt)}`}
          </div>
        </div>
        <Stars value={r.rating} />
      </div>
      <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{r.body}</p>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {subs
          .filter(([, v]) => v !== null)
          .map(([label, v]) => (
            <div key={label} className="flex gap-1">
              <dt>{label}</dt>
              <dd className="font-medium text-ink">{v}/5</dd>
            </div>
          ))}
      </dl>
      {r.ownerReply && (
        <div className="mt-3 rounded-xl bg-bg p-3 text-sm">
          <div className="text-xs font-medium text-ink">
            Reply from the hostel{r.ownerRepliedAt && <span className="font-normal text-ink-muted"> · {dateLabel(r.ownerRepliedAt)}</span>}
          </div>
          <p className="mt-1 whitespace-pre-line text-ink-soft">{r.ownerReply}</p>
        </div>
      )}
      {canFlag && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-ink-muted hover:text-danger">Report this review</summary>
          <form action={flagReviewAction} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="reviewId" value={r.id} />
            <Select name="reason" defaultValue={FLAG_REASONS[0]} className="h-8 w-auto text-xs" aria-label="Reason">
              {FLAG_REASONS.map((x) => <option key={x}>{x}</option>)}
            </Select>
            <button type="submit" className="rounded-lg border border-line px-3 py-1 text-ink-soft hover:border-danger hover:text-danger">Send to our team</button>
          </form>
        </details>
      )}
    </Card>
  );
}
