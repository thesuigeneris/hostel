import { addDays, type HostelDetail, istDate, rupees, SHARING_LABEL } from '@hostels/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Button, Card, Chip, Empty, ErrorText, Field, H2, Loading, P, Row, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function Move() {
  const { data, error, loading } = useLoad(async () => {
    const [mine, verified] = await Promise.all([api.me.subscription(), api.hostels.search({ verified: 'true', limit: 50 })]);
    return { mine, verified: verified.items };
  });
  const [slug, setSlug] = useState<string | null>(null);
  const [dest, setDest] = useState<HostelDetail | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [date, setDate] = useState(addDays(istDate(), 1));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!data?.mine) return <Screen><ErrorText>{error}</ErrorText><Empty title="You need an active plan to move" /></Screen>;
  const { mine, verified } = data;

  async function pick(s: string) {
    setSlug(s);
    setRoomId(null);
    setErr(null);
    try {
      setDest(await api.hostels.get(s));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function schedule() {
    if (!roomId) return;
    setBusy(true);
    setErr(null);
    try {
      await api.me.move({ toRoomTypeId: roomId, moveDate: date });
      router.back();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const rooms = (dest?.roomTypes ?? []).filter((r) => r.id !== mine.roomType.id && r.bedsAvailable > 0);
  return (
    <Screen>
      <P>Your bed at the new place is held as soon as you schedule. Bills after the move date use the new rent.</P>
      <H2>Where to</H2>
      <Row>{verified.map((h) => <Chip key={h.id} label={h.id === mine.hostel.id ? `${h.name} (current)` : h.name} active={slug === h.slug} onPress={() => pick(h.slug)} />)}</Row>
      {dest && (
        <>
          <H2>Room</H2>
          {rooms.length === 0 ? <Empty title="No free beds here" /> : rooms.map((r) => (
            <Pressable key={r.id} accessibilityRole="radio" accessibilityState={{ checked: r.id === roomId }} onPress={() => setRoomId(r.id)}>
              <Card style={r.id === roomId ? { borderColor: theme.colors.brand, borderWidth: 2 } : undefined}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: theme.colors.text }}>{SHARING_LABEL[r.sharing]}</Text>
                  <P>{rupees(r.monthlyRent)} /month</P>
                </Row>
              </Card>
            </Pressable>
          ))}
          <Field label="Move date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" hint="Tomorrow or later." />
        </>
      )}
      <ErrorText>{err}</ErrorText>
      <Button title="Schedule move" onPress={schedule} busy={busy} disabled={!roomId} />
    </Screen>
  );
}
