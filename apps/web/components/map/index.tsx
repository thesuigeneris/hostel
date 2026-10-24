'use client';
import dynamic from 'next/dynamic';

/** Client-only map (Leaflet touches `window`). Give the parent an explicit height. */
export const Map = dynamic(() => import('./leaflet-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-[var(--radius-card)] bg-line/50" />,
});
export type { MapMarker } from './leaflet-map';
