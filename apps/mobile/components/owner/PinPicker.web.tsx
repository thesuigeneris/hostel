import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Field, Row } from '@/components/ui';
import { parseCoord } from '@/lib/owner';
import { theme } from '@/lib/theme';
import { UseMyLocation } from './UseMyLocation';

// react-native-maps has no web build. The web preview takes the pin as typed coordinates instead, with a link to check it.
export function PinPicker({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  const [la, setLa] = useState(lat.toFixed(6));
  const [ln, setLn] = useState(lng.toFixed(6));
  useEffect(() => {
    setLa(lat.toFixed(6));
    setLn(lng.toFixed(6));
  }, [lat, lng]);

  const commit = (nextLa: string, nextLn: string) => {
    const a = parseCoord(nextLa, 'lat');
    const b = parseCoord(nextLn, 'lng');
    if (a !== null && b !== null) onChange(a, b);
  };

  return (
    <View style={{ gap: theme.spacing.sm, backgroundColor: theme.colors.brandSoft, borderRadius: theme.radius.md, padding: theme.spacing.md }}>
      <Row style={{ flexWrap: 'nowrap' }}>
        <View style={{ flex: 1 }}>
          <Field label="Latitude" value={la} keyboardType="decimal-pad" onChangeText={(v) => { setLa(v); commit(v, ln); }} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Longitude" value={ln} keyboardType="decimal-pad" onChangeText={(v) => { setLn(v); commit(la, v); }} />
        </View>
      </Row>
      <Pressable onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`)}>
        <Text style={{ color: theme.colors.brand, textDecorationLine: 'underline' }}>Check the pin on OpenStreetMap</Text>
      </Pressable>
      <UseMyLocation onLocate={onChange} />
    </View>
  );
}
