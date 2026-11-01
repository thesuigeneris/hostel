import * as Location from 'expo-location';
import { useState } from 'react';
import { Button, ErrorText } from '@/components/ui';

/** Drops the pin where the phone is, for owners filling the form standing at their gate. */
export function UseMyLocation({ onLocate }: { onLocate: (lat: number, lng: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function locate() {
    setBusy(true);
    setErr(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('Allow location access to use where you are.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      onLocate(pos.coords.latitude, pos.coords.longitude);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't get your location");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button small variant="secondary" title="Use my current location" busy={busy} onPress={locate} />
      <ErrorText>{err}</ErrorText>
    </>
  );
}
