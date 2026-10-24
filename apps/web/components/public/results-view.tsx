'use client';
import { useState } from 'react';
import type { HostelSummary } from '@hostels/shared';
import { Map } from '@/components/map';
import { cn } from '@/lib/cn';
import { rupees } from '@/lib/format';
import { HostelCard } from './hostel-card';

/** Search results as a grid, a map, or both side by side on wide screens. */
export function ResultsView({ items }: { items: HostelSummary[] }) {
  const [view, setView] = useState<'list' | 'map'>('list');
  const markers = items.map((h) => ({ id: h.id, lat: h.lat, lng: h.lng, label: h.name, href: `/hostels/${h.slug}`, sublabel: `${h.area} · from ${rupees(h.minRent)}` }));

  return (
    <div>
      <div className="mb-4 inline-flex rounded-full border border-line bg-surface p-1 lg:hidden" role="tablist">
        {(['list', 'map'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn('rounded-full px-4 py-1.5 text-sm font-medium capitalize', view === v ? 'bg-brand text-white' : 'text-muted')}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className={cn('grid content-start gap-5 sm:grid-cols-2', view === 'map' && 'hidden lg:grid')}>
          {items.map((h) => (
            <HostelCard key={h.id} h={h} />
          ))}
        </div>
        <div className={cn('h-[70vh] lg:sticky lg:top-24 lg:block', view === 'list' && 'hidden')}>
          <Map markers={markers} />
        </div>
      </div>
    </div>
  );
}
