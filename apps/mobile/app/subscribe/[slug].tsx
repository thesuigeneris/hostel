import { computeBill, type Diet, FOOD_PLANS, MEAL_PLANS, type MealPlan, rupees, SHARING_LABEL } from '@hostels/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Button, Card, Empty, ErrorState, ErrorText, H1, H2, Loading, P, Row, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openPayment } from '@/lib/pay';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function Subscribe() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user, ready } = useAuth();
  const { data: h, error, loading, reload } = useLoad(() => api.hostels.get(slug), [slug]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [plan, setPlan] = useState<MealPlan>('full');
  const [diet, setDiet] = useState<Diet>('veg');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading || !ready) return <Loading />;
  if (!h) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!user) {
    return (
      <Screen>
        <Empty title="Log in to subscribe">We'll text you a code. New here? It takes a minute.</Empty>
        <Button title="Log in" onPress={() => router.push({ pathname: '/login', params: { next: `/subscribe/${slug}` } })} />
      </Screen>
    );
  }
  if (user.role !== 'tenant') {
    return <Screen><Empty title="Subscriptions are for tenant accounts">You're signed in as a hostel {user.role}. Log in with a personal number to subscribe.</Empty></Screen>;
  }
  const rooms = h.roomTypes.filter((r) => r.bedsAvailable > 0);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const plans = h.foodAvailable ? MEAL_PLANS : (['none'] as const);
  const chosenPlan = plans.includes(plan as never) ? plan : 'none';
  if (!h.isVerified || !room) {
    return (
      <Screen>
        <Empty title={h.isVerified ? 'All beds are taken right now' : "This hostel isn't a verified partner yet"}>
          {h.isVerified ? 'Check back soon, or look at other verified hostels nearby.' : 'You can request a visit from the hostel page instead.'}
        </Empty>
        <Button variant="secondary" title={`Back to ${h.name}`} onPress={() => router.back()} />
      </Screen>
    );
  }
  const bill = computeBill({ rent: room.monthlyRent, mealPlan: chosenPlan, skipCredits: 0 });

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.hostels.subscribe(h!.id, { roomTypeId: room!.id, mealPlan: chosenPlan, diet });
      // The bed is held now. If the browser doesn't open, My Stay shows the bill with a Pay button.
      router.replace('/stay');
      await openPayment(res.invoice.id).catch(() => undefined);
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
          <P muted>Skip a meal before its cut-off and the credit comes off your next bill.</P>
        </>
      )}
      <Card tone="brand">
        <Row style={{ justifyContent: 'space-between' }}><P>Rent</P><P>{rupees(bill.rentAmount)}</P></Row>
        <Row style={{ justifyContent: 'space-between' }}><P>Food</P><P>{rupees(bill.foodAmount)}</P></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontWeight: '700', color: theme.colors.text }}>First month</Text><Text style={{ fontWeight: '700', fontSize: 18, color: theme.colors.text }}>{rupees(bill.totalAmount)}</Text></Row>
        <P muted>Your plan starts today. We hold the bed for 30 minutes while you pay the first month; payment opens in your browser. After that, bills arrive five days before each month starts.</P>
      </Card>
      <ErrorText>{err}</ErrorText>
      <Button title="Continue to payment" onPress={go} busy={busy} />
    </Screen>
  );
}
