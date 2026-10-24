import { computeBill, type Diet, FOOD_PLANS, MEAL_PLANS, type MealPlan, rupees, SHARING_LABEL } from '@hostels/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Button, Card, Empty, ErrorText, H1, H2, Loading, P, Row, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { openPayment } from '@/lib/pay';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function Subscribe() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: h, error, loading } = useLoad(() => api.hostels.get(slug), [slug]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [plan, setPlan] = useState<MealPlan>('full');
  const [diet, setDiet] = useState<Diet>('veg');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!h) return <Screen><ErrorText>{error}</ErrorText></Screen>;
  const rooms = h.roomTypes.filter((r) => r.bedsAvailable > 0);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const plans = h.foodAvailable ? MEAL_PLANS : (['none'] as const);
  const chosenPlan = plans.includes(plan as never) ? plan : 'none';
  if (!h.isVerified || !room) return <Screen><Empty title={h.isVerified ? 'All beds are taken right now' : "This hostel isn't a verified partner yet"} /></Screen>;
  const bill = computeBill({ rent: room.monthlyRent, mealPlan: chosenPlan, skipCredits: 0 });

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.hostels.subscribe(h!.id, { roomTypeId: room!.id, mealPlan: chosenPlan, diet });
      await openPayment(res.invoice.id);
      router.replace('/stay');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>{h.name}</H1>
      <P>One monthly bill for bed and food. No advance, cancel anytime.</P>
      <H2>1. Room</H2>
      {rooms.map((r) => (
        <Pressable key={r.id} accessibilityRole="radio" accessibilityState={{ checked: r.id === room.id }} onPress={() => setRoomId(r.id)}>
          <Card style={r.id === room.id ? { borderColor: theme.colors.brand, borderWidth: 2 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{SHARING_LABEL[r.sharing]}</Text>
              <Text style={{ color: theme.colors.brand }}>{r.bedsAvailable} free</Text>
            </Row>
            <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.text }}>{rupees(r.monthlyRent)} /month</Text>
          </Card>
        </Pressable>
      ))}
      <H2>2. Food plan</H2>
      {plans.map((p) => (
        <Pressable key={p} accessibilityRole="radio" accessibilityState={{ checked: p === chosenPlan }} onPress={() => setPlan(p)}>
          <Card style={p === chosenPlan ? { borderColor: theme.colors.food, borderWidth: 2 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{FOOD_PLANS[p].label}</Text>
              <Text style={{ fontWeight: '700', color: theme.colors.text }}>{FOOD_PLANS[p].price ? `+${rupees(FOOD_PLANS[p].price)}` : 'No food'}</Text>
            </Row>
            <P muted>{FOOD_PLANS[p].meals.length ? FOOD_PLANS[p].meals.join(', ') : 'Bed only'}</P>
          </Card>
        </Pressable>
      ))}
      {chosenPlan !== 'none' && (
        <>
          <H2>3. Diet</H2>
          <Segmented value={diet} onChange={setDiet} options={[{ value: 'veg', label: 'Veg' }, { value: 'non-veg', label: 'Non-veg' }]} />
        </>
      )}
      <Card tone="brand">
        <Row style={{ justifyContent: 'space-between' }}><P>Rent</P><P>{rupees(bill.rentAmount)}</P></Row>
        <Row style={{ justifyContent: 'space-between' }}><P>Food</P><P>{rupees(bill.foodAmount)}</P></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontWeight: '700', color: theme.colors.text }}>First month</Text><Text style={{ fontWeight: '700', fontSize: 18, color: theme.colors.text }}>{rupees(bill.totalAmount)}</Text></Row>
        <P muted>We hold your bed for 30 minutes while you pay. Payment opens in your browser.</P>
      </Card>
      <ErrorText>{err}</ErrorText>
      <Button title="Continue to payment" onPress={go} busy={busy} />
    </Screen>
  );
}
