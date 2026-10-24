'use client';

import dynamic from 'next/dynamic';

// Leaflet touches `window`, so maps only render in the browser.
export const ClientHostelMap = dynamic(() => import('./Map').then((m) => m.HostelMap), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-2xl bg-brand-soft" />,
});
export const ClientPinPicker = dynamic(() => import('./Map').then((m) => m.PinPicker), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-brand-soft" />,
});
