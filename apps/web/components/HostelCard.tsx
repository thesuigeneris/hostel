import type { HostelSummary } from '@hostels/shared';
import Link from 'next/link';
import { GENDER_LABEL, rupees, SHARING_LABEL } from '@/lib/format';
import { Photo } from './Photo';
import { Badge, Stars, VerifiedLabel } from './ui';

/**
 * A search result. The hostel name is the link, stretched over the card, so the whole card is clickable
 * while screen readers announce just the name rather than every line of the card.
 */
export function HostelCard({ h }: { h: HostelSummary }) {
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition duration-panel ease-out focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-bg hover:-translate-y-0.5 hover:shadow-raised motion-reduce:hover:translate-y-0">
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
            <h3 className="truncate font-semibold text-ink">
              <Link href={`/hostels/${h.slug}`} className="text-ink no-underline after:absolute after:inset-0 focus-visible:outline-none">
                {h.name}
              </Link>
            </h3>
            <p className="text-sm text-ink-soft">
              {h.area} · {GENDER_LABEL[h.genderType]}
              {h.distanceKm !== undefined && ` · ${h.distanceKm} km away`}
            </p>
          </div>
          {h.reviewCount > 0 && <Stars value={h.rating} />}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <span className="text-lg font-semibold tabular-nums text-ink">{h.minRent === null ? 'Rent not listed' : rupees(h.minRent)}</span>
            {h.minRent !== null && <span className="text-sm text-ink-muted"> /month{h.isVerified ? ', no advance' : ''}</span>}
          </div>
          <div className={h.bedsAvailable > 0 ? 'text-right text-sm text-brand' : 'text-right text-sm text-ink-muted'}>
            {h.bedsAvailable > 0 ? `${h.bedsAvailable} ${h.bedsAvailable === 1 ? 'bed' : 'beds'} free` : 'Full'}
          </div>
        </div>
        {h.sharingTypes.length > 0 && <p className="mt-1 text-xs text-ink-muted">{h.sharingTypes.map((s) => SHARING_LABEL[s]).join(' · ')}</p>}
      </div>
    </article>
  );
}
