'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { buttonClass } from './ui';

/** Sorts the current search by distance. The location stays in the URL only; it is never stored. */
export function NearMeButton() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [state, setState] = useState<'idle' | 'locating' | 'denied'>('idle');
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        className={buttonClass('secondary', 'sm')}
        disabled={state === 'locating'}
        onClick={() => {
          if (!navigator.geolocation) return setState('denied');
          setState('locating');
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const next = new URLSearchParams(params.toString());
              next.set('lat', pos.coords.latitude.toFixed(5));
              next.set('lng', pos.coords.longitude.toFixed(5));
              next.set('sort', 'distance');
              next.delete('page');
              setState('idle');
              router.push(`${pathname}?${next.toString()}`);
            },
            () => setState('denied'),
            { timeout: 10_000 },
          );
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current"><path d="M10 2a6 6 0 0 0-6 6c0 4.4 6 10 6 10s6-5.6 6-10a6 6 0 0 0-6-6zm0 8.2A2.2 2.2 0 1 1 10 5.8a2.2 2.2 0 0 1 0 4.4z" /></svg>
        {state === 'locating' ? 'Finding you…' : 'Near me'}
      </button>
      <output className="mt-1 block max-w-56 text-right text-xs text-danger empty:hidden">
        {state === 'denied' ? 'Location is unavailable. Allow it in your browser, or choose an area.' : ''}
      </output>
    </div>
  );
}
