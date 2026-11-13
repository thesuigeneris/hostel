import type { HostelSummary } from '@hostels/shared';
import { Linking, Pressable, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

// react-native-maps has no web build. The web preview (used for smoke tests) shows a link to OpenStreetMap instead.
export function HostelMap({ hostels, height = 200 }: { hostels: Pick<HostelSummary, 'id' | 'slug' | 'name' | 'lat' | 'lng' | 'isVerified' | 'minRent'>[]; height?: number; center?: { lat: number; lng: number } }) {
  const first = hostels[0];
  return (
    <View style={{ height: Math.min(height, 160), borderRadius: theme.radius.md, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Text style={{ color: theme.colors.brand, fontWeight: '600' }}>{hostels.length} on the map</Text>
      {first && (
        <Pressable onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${first.lat}&mlon=${first.lng}#map=15/${first.lat}/${first.lng}`)}>
          <Text style={{ color: theme.colors.brand, textDecorationLine: 'underline' }}>Open in OpenStreetMap</Text>
        </Pressable>
      )}
    </View>
  );
}
