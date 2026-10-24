'use client';
import { useState } from 'react';
import type { HostelPhoto } from '@hostels/shared';
import { cn } from '@/lib/cn';
import { FALLBACK_PHOTO } from './hostel-card';

export function Gallery({ photos, name }: { photos: HostelPhoto[]; name: string }) {
  const sorted = [...photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const urls = sorted.length ? sorted.map((p) => p.url) : [FALLBACK_PHOTO];
  const [active, setActive] = useState(0);
  return (
    <div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-[var(--radius-card)] bg-line/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[active]} alt={`${name}, photo ${active + 1}`} className="h-full w-full object-cover" />
        {urls.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setActive((a) => (a - 1 + urls.length) % urls.length)}
              className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setActive((a) => (a + 1) % urls.length)}
              className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow"
            >
              ›
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {active + 1} / {urls.length}
            </span>
          </>
        )}
      </div>
      {urls.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {urls.map((u, i) => (
            <button
              key={u + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1}`}
              className={cn('h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2', i === active ? 'border-brand' : 'border-transparent opacity-70')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
