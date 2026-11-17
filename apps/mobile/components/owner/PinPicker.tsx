import { useRef } from 'react';
import { Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import { LeafletView } from '../LeafletView';
import { UseMyLocation } from './UseMyLocation';

/** Tap the map or drag the pin to the hostel's gate. Tenants searching nearby find the hostel by this point. */
export function PinPicker({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  const setPin = useRef<((lat: number, lng: number) => void) | null>(null);
  const move = (la: number, ln: number) => {
    onChange(la, ln);
    setPin.current?.(la, ln);
  };
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <LeafletView
        label="Map: tap or drag the pin to the hostel's gate"
        style={{ height: 260 }}
        page={{ center: { lat, lng }, zoom: 16, picker: true, pins: [{ id: 'pin', lat, lng, label: 'Hostel gate' }] }}
        onPin={onChange}
        pinRef={setPin}
      />
      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>
      <UseMyLocation onLocate={move} />
    </View>
  );
}
