import type { HostelSummary } from '@hostels/shared';
import { router } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { theme } from '@/lib/theme';

const HYDERABAD = { latitude: 17.4435, longitude: 78.3772, latitudeDelta: 0.12, longitudeDelta: 0.12 };

export function HostelMap({ hostels, height = 420, center }: { hostels: Pick<HostelSummary, 'id' | 'slug' | 'name' | 'lat' | 'lng' | 'isVerified' | 'minRent'>[]; height?: number; center?: { lat: number; lng: number } }) {
  const first = center ?? (hostels[0] ? { lat: hostels[0].lat, lng: hostels[0].lng } : null);
  const region = first ? { latitude: first.lat, longitude: first.lng, latitudeDelta: hostels.length > 1 ? 0.08 : 0.01, longitudeDelta: hostels.length > 1 ? 0.08 : 0.01 } : HYDERABAD;
  return (
    <MapView style={{ height, borderRadius: theme.radius.md }} initialRegion={region}>
      {hostels.map((h) => (
        <Marker
          key={h.id}
          coordinate={{ latitude: h.lat, longitude: h.lng }}
          title={h.name}
          description={h.minRent ? `From ₹${h.minRent.toLocaleString('en-IN')}/month` : undefined}
          pinColor={h.isVerified ? theme.colors.brand : theme.colors.food}
          onCalloutPress={() => hostels.length > 1 && router.push(`/hostel/${h.slug}`)}
        />
      ))}
    </MapView>
  );
}
