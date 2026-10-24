import type { HostelSummary } from '@hostels/shared';
import Link from 'next/link';
import { GENDER_LABEL, rupees, SHARING_LABEL } from '@/lib/format';
import { Badge, Stars } from './ui';

export function HostelCard({ h }: { h: HostelSummary }) {
  return (
    <Link href={`/hostels/${h.slug}`} className="group block overflow-hidden rounded-2xl border border-line bg-surface no-underline shadow-card transition hover:-translate-y-0.5">
      <div className="relative aspect-[4/3] bg-brand-soft">
        {h.coverPhotoUrl && (
          <img src={h.coverPhotoUrl} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        )}
        <div className="absolute left-3 top-3 flex gap-1">
          {h.isVerified && <Badge tone="green" className="bg-white/95">✓ Verified · No advance</Badge>}
          {h.foodAvailable && <Badge tone="food" className="bg-white/95">Food</Badge>}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-ink">{h.name}</div>
            <div className="text-sm text-ink-soft">
              {h.area} · {GENDER_LABEL[h.genderType]}
              {h.distanceKm !== undefined && ` · ${h.distanceKm} km`}
            </div>
          </div>
          {h.reviewCount > 0 && <Stars value={h.rating} />}
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <span className="text-lg font-semibold text-ink">{rupees(h.minRent)}</span>
            <span className="text-sm text-ink-muted"> /month</span>
          </div>
          <div className={h.bedsAvailable > 0 ? 'text-sm text-brand' : 'text-sm text-ink-muted'}>
            {h.bedsAvailable > 0 ? `${h.bedsAvailable} beds free` : 'Full'}
          </div>
        </div>
        <div className="mt-2 text-xs text-ink-muted">{h.sharingTypes.map((s) => SHARING_LABEL[s]).join(' · ')}</div>
      </div>
    </Link>
  );
}
