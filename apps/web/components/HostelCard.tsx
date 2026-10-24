import type { HostelSummary } from '@hostels/shared';
import Link from 'next/link';
import { GENDER_LABEL, rupees, SHARING_LABEL } from '@/lib/format';
import { Photo } from './Photo';
import { Badge, focusRing, Stars, VerifiedLabel } from './ui';

export function HostelCard({ h }: { h: HostelSummary }) {
  return (
    <Link
      href={`/hostels/${h.slug}`}
      className={`group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface no-underline shadow-card transition duration-panel ease-out hover:-translate-y-0.5 hover:shadow-raised motion-reduce:hover:translate-y-0 ${focusRing}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-brand-soft">
        <Photo src={h.coverPhotoUrl} alt="" className="h-full w-full object-cover transition duration-section ease-out group-hover:scale-[1.03] motion-reduce:group-hover:scale-100" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {h.isVerified && <VerifiedLabel compact />}
          {h.foodAvailable && <Badge tone="food" className="bg-white/95">Food</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-ink">{h.name}</h3>
            <p className="text-sm text-ink-soft">
              {h.area} · {GENDER_LABEL[h.genderType]}
              {h.distanceKm !== undefined && ` · ${h.distanceKm} km`}
            </p>
          </div>
          {h.reviewCount > 0 && <Stars value={h.rating} />}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <span className="text-lg font-semibold tabular-nums text-ink">{rupees(h.minRent)}</span>
            <span className="text-sm text-ink-muted"> /month{h.isVerified ? ', no advance' : ''}</span>
          </div>
          <div className={h.bedsAvailable > 0 ? 'text-right text-sm text-brand' : 'text-right text-sm text-ink-muted'}>
            {h.bedsAvailable > 0 ? `${h.bedsAvailable} beds free` : 'Full'}
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-muted">{h.sharingTypes.map((s) => SHARING_LABEL[s]).join(' · ')}</p>
      </div>
    </Link>
  );
}
