import Link from 'next/link';
import type { HostelSummary } from '@hostels/shared';
import { Badge, VerifiedBadge } from '@/components/ui/badge';
import { Stars } from '@/components/ui/stars';
import { GENDER_LABEL, SHARING_LABEL, rupees } from '@/lib/format';

export const FALLBACK_PHOTO = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=1200';

export function HostelCard({ h, compact }: { h: HostelSummary; compact?: boolean }) {
  return (
    <Link
      href={`/hostels/${h.slug}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition-shadow hover:shadow-lg"
    >
      <div className={compact ? 'relative aspect-[16/9] overflow-hidden' : 'relative aspect-[4/3] overflow-hidden'}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={h.coverPhotoUrl ?? FALLBACK_PHOTO}
          alt={h.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {h.partnerStatus === 'verified' && <VerifiedBadge />}
          {h.foodAvailable && <Badge tone="food">Food included</Badge>}
        </div>
      </div>
      <div className="space-y-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-ink group-hover:text-brand">{h.name}</h3>
          {h.reviewCount > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-sm">
              <Stars value={h.rating} />
              <span className="text-muted">({h.reviewCount})</span>
            </span>
          )}
        </div>
        <p className="text-sm text-muted">
          {h.area}, {h.city} · {GENDER_LABEL[h.genderType]}
          {h.distanceKm !== undefined && ` · ${h.distanceKm.toFixed(1)} km away`}
        </p>
        <p className="text-xs text-muted">{h.sharingTypes.map((s) => SHARING_LABEL[s]).join(' · ')}</p>
        <div className="flex items-end justify-between pt-1">
          <div>
            <span className="text-lg font-semibold text-ink">{rupees(h.minRent)}</span>
            <span className="text-sm text-muted"> /month{h.partnerStatus === 'verified' ? ' · no advance' : ''}</span>
          </div>
          <span className={h.bedsAvailable > 0 ? 'text-xs font-medium text-ok' : 'text-xs font-medium text-danger'}>
            {h.bedsAvailable > 0 ? `${h.bedsAvailable} beds free` : 'Full'}
          </span>
        </div>
      </div>
    </Link>
  );
}
