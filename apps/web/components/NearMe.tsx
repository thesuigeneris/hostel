'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function NearMeButton() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<'idle' | 'locating' | 'denied'>('idle');
  return (
    <button
      type="button"
      className="h-9 rounded-xl border border-line bg-surface px-3 text-sm text-ink-soft hover:border-brand hover:text-brand"
      onClick={() => {
        if (!navigator.geolocation) return setState('denied');
        setState('locating');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const next = new URLSearchParams(params.toString());
            next.set('lat', pos.coords.latitude.toFixed(5));
            next.set('lng', pos.coords.longitude.toFixed(5));
            next.set('sort', 'distance');
            router.push(`/hostels?${next.toString()}`);
          },
          () => setState('denied'),
          { timeout: 10_000 },
        );
      }}
    >
      {state === 'locating' ? 'Locating…' : state === 'denied' ? 'Location unavailable' : '◎ Near me'}
    </button>
  );
}
