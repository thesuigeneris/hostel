import type { RatingSummary, Review } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { Stars } from '@/components/ui/stars';
import { formatDate } from '@/lib/format';

const DIMENSIONS: { key: keyof Omit<RatingSummary, 'count' | 'overall'>; label: string }[] = [
  { key: 'food', label: 'Food' },
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'safety', label: 'Safety' },
  { key: 'value', label: 'Value' },
  { key: 'staff', label: 'Staff' },
];

export function RatingBreakdown({ rating }: { rating: RatingSummary }) {
  return (
    <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
      <div>
        <div className="text-4xl font-semibold">{rating.overall?.toFixed(1) ?? '—'}</div>
        <Stars value={rating.overall} size="md" />
        <div className="mt-1 text-sm text-muted">
          {rating.count} verified {rating.count === 1 ? 'review' : 'reviews'}
        </div>
      </div>
      <div className="space-y-2">
        {DIMENSIONS.filter((d) => rating[d.key] !== null).map((d) => (
          <div key={d.key} className="flex items-center gap-3 text-sm">
            <span className="w-24 text-muted">{d.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-food" style={{ width: `${((rating[d.key] ?? 0) / 5) * 100}%` }} />
            </div>
            <span className="w-8 text-right font-medium">{rating[d.key]?.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReviewItem({ r }: { r: Review }) {
  return (
    <article className="border-b border-line py-5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={r.overall} />
        <h4 className="font-semibold">{r.title}</h4>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{r.author.name}</span>
        {r.verifiedResident && <Badge tone="brand">Verified resident</Badge>}
        {r.stayedFrom && (
          <span>
            Stayed {formatDate(r.stayedFrom, { month: 'short', year: 'numeric' })} – {r.stayedTo ? formatDate(r.stayedTo, { month: 'short', year: 'numeric' }) : 'now'}
          </span>
        )}
        <span>· {formatDate(r.createdAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-ink">{r.body}</p>
      {r.ownerReply && (
        <div className="mt-3 rounded-xl bg-bg p-3 text-sm">
          <div className="text-xs font-medium text-brand">Reply from the owner{r.ownerRepliedAt && ` · ${formatDate(r.ownerRepliedAt)}`}</div>
          <p className="mt-1 whitespace-pre-line text-ink">{r.ownerReply}</p>
        </div>
      )}
    </article>
  );
}
