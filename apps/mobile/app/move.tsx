import { addDays, type HostelDetail, istDate, rupees, SHARING_LABEL } from '@hostels/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { DateChips } from '@/components/DateChips';
import { Button, Card, Chip, Empty, ErrorState, ErrorText, H2, Loading, P, Row, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { dateProblem } from '@/lib/dates';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function Move() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [mine, verified] = await Promise.all([api.me.subscription(), api.hostels.search({ verified: 'true', limit: 50 })]);
    return { mine, verified: verified.items };
  });
  const [slug, setSlug] = useState<string | null>(null);
  const [dest, setDest] = useState<HostelDetail | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const today = istDate();
  const earliest = addDays(today, 1);
  const [date, setDate] = useState(earliest);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(s: string) {
    setSlug(s);
    setRoomId(null);
    setErr(null);
    try {
      const h = await api.hostels.get(s);
      setDest(h);
      setRoomId((cur) => cur ?? h.roomTypes.find((r) => r.id !== data?.mine?.roomType.id && r.bedsAvailable > 0)?.id ?? null);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  // Start on the current hostel, so changing room is one tap away.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the subscription first loads
  useEffect(() => {
    if (data?.mine && !slug) pick(data.mine.hostel.slug);
  }, [data?.mine?.hostel.slug]);

  if (loading) return <Loading />;
  if (!data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data.mine || data.mine.subscription.status !== 'active') {
    return (
      <Screen>
        <Empty title="You need an active plan to move">Subscribe to a verified hostel first.</Empty>
        <Button variant="secondary" title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }
  const { mine, verified } = data;

  async function schedule() {
    if (!roomId) return;
    const problem = dateProblem(date, earliest);
    if (problem) return setErr(problem);
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
      <P>Your bed at the new place is held as soon as you schedule. Bills after the move date use the new rent. No fee, no paperwork.</P>
      <H2>Where to</H2>
      <Row>{verified.map((h) => <Chip key={h.id} label={h.id === mine.hostel.id ? `${h.name} (current)` : `${h.name} · ${h.area}`} active={slug === h.slug} onPress={() => pick(h.slug)} />)}</Row>
      {dest && (
        <>
          <H2>Room</H2>
          {rooms.length === 0 ? <Empty title="No free beds here">Try another hostel.</Empty> : rooms.map((r) => (
            <Pressable key={r.id} accessibilityRole="radio" accessibilityState={{ checked: r.id === roomId }} onPress={() => setRoomId(r.id)}>
              <Card style={r.id === roomId ? { borderColor: theme.colors.brand, borderWidth: 2 } : undefined}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: theme.colors.text }}>{SHARING_LABEL[r.sharing]}</Text>
                  <P>{rupees(r.monthlyRent)} /month · {r.bedsAvailable} free</P>
                </Row>
              </Card>
            </Pressable>
          ))}
          <DateChips label="Move date" from={today} start={1} days={30} value={date} onChange={setDate} hint="Tomorrow or later." />
        </>
      )}
      <ErrorText>{err}</ErrorText>
      <Button title="Schedule move" onPress={schedule} busy={busy} disabled={!roomId || rooms.length === 0} />
    </Screen>
  );
}
