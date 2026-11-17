import type { HostelSummary } from '@hostels/shared';
import { router } from 'expo-router';
import { LeafletView } from './LeafletView';

const HYDERABAD = { lat: 17.4435, lng: 78.3772 };

/** Hostels on a free Leaflet map; tapping a hostel's name in its popup opens it (on the list map). */
export function HostelMap({ hostels, height = 420, center }: { hostels: Pick<HostelSummary, 'id' | 'slug' | 'name' | 'lat' | 'lng' | 'isVerified' | 'minRent'>[]; height?: number; center?: { lat: number; lng: number } }) {
  const many = hostels.length > 1;
  const first = center ?? (hostels[0] ? { lat: hostels[0].lat, lng: hostels[0].lng } : HYDERABAD);
  return (
    <LeafletView
      label={many ? `Map of ${hostels.length} hostels` : `Map showing ${hostels[0]?.name ?? 'the hostel'}`}
      style={{ height }}
      page={{
        center: first,
        zoom: many ? 13 : 16,
        fit: many,
        pins: hostels.map((h) => ({
          id: h.id,
          lat: h.lat,
          lng: h.lng,
          label: h.name,
          sub: h.minRent ? `From ₹${h.minRent.toLocaleString('en-IN')}/month` : undefined,
          verified: h.isVerified,
          slug: many ? h.slug : undefined,
        })),
      }}
      onOpen={(slug) => router.push(`/hostel/${slug}`)}
    />
  );
}
