import { useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { theme } from '@/lib/theme';
import { UseMyLocation } from './UseMyLocation';

/** Tap the map or drag the pin to the hostel's gate. Tenants searching nearby find the hostel by this point. */
export function PinPicker({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  const map = useRef<MapView>(null);
  const move = (la: number, ln: number) => {
    onChange(la, ln);
    map.current?.animateToRegion({ latitude: la, longitude: ln, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 300);
  };
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <MapView
        ref={map}
        style={{ height: 260, borderRadius: theme.radius.md }}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        onPress={(e) => onChange(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
      >
        <Marker
          draggable
          coordinate={{ latitude: lat, longitude: lng }}
          pinColor={theme.colors.brand}
          onDragEnd={(e) => onChange(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
        />
      </MapView>
      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>
      <UseMyLocation onLocate={move} />
    </View>
  );
}
