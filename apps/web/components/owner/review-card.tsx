import type { ReactNode } from 'react';
import type { Review } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Stars } from '@/components/ui/stars';
import { formatDate, timeAgo } from '@/lib/format';

export function ReviewCard({ review: r, footer, header }: { review: Review; footer?: ReactNode; header?: ReactNode }) {
  const scores: [string, number | null][] = [
    ['Food', r.food],
    ['Cleanliness', r.cleanliness],
    ['Safety', r.safety],
    ['Value', r.value],
    ['Staff', r.staff],
  ];
  return (
    <Card>
      <CardBody className="space-y-3">
        {header}
        <div className="flex flex-wrap items-center gap-2">
          <Stars value={r.overall} size="md" />
          <span className="font-semibold">{r.title}</span>
          {r.status === 'hidden' && <Badge tone="danger">Hidden</Badge>}
          <span className="ml-auto text-xs text-muted">{timeAgo(r.createdAt)}</span>
        </div>
        <div className="text-xs text-muted">
          {r.author.name}
          {r.verifiedResident && ' · Verified resident'}
          {r.stayedFrom && ` · stayed ${formatDate(r.stayedFrom, { month: 'short', year: 'numeric' })}${r.stayedTo ? ` – ${formatDate(r.stayedTo, { month: 'short', year: 'numeric' })}` : ' – now'}`}
        </div>
        <p className="whitespace-pre-wrap text-sm">{r.body}</p>
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          {scores
            .filter(([, v]) => v !== null)
            .map(([k, v]) => (
              <span key={k}>
                {k} <strong className="text-ink">{v}</strong>/5
              </span>
            ))}
        </div>
        {r.ownerReply && (
          <div className="rounded-xl bg-brand-soft p-3 text-sm">
            <div className="mb-1 text-xs font-medium text-brand">Owner&apos;s reply{r.ownerRepliedAt && ` · ${timeAgo(r.ownerRepliedAt)}`}</div>
            <p className="whitespace-pre-wrap">{r.ownerReply}</p>
          </div>
        )}
        {footer}
      </CardBody>
    </Card>
  );
}
