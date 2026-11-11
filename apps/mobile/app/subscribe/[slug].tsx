import {
  bedHold,
  computeBill,
  dateLabel,
  type Diet,
  FOOD_PLANS,
  MEAL_PLANS,
  type MealPlan,
  type MySubscription,
  PENDING_SUBSCRIPTION_TTL_MINUTES,
  rupees,
  SHARING_LABEL,
} from '@hostels/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Button, Card, Empty, ErrorState, ErrorText, H1, H2, Loading, Notice, P, Row, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openPayment } from '@/lib/pay';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function Subscribe() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user, ready } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [h, mine] = await Promise.all([api.hostels.get(slug), user ? api.me.subscription() : Promise.resolve(null)]);
    return { h, mine };
  }, [slug, user?.id]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [plan, setPlan] = useState<MealPlan>('full');
  const [diet, setDiet] = useState<Diet>('veg');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (loading || !ready) return <Loading />;
  if (!data) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  const { h, mine } = data;
  if (!user) {
    return (
      <Screen>
        <Empty title="Log in to subscribe">Log in or create an account first. It takes a minute, and you come straight back here.</Empty>
        <Button title="Log in" onPress={() => router.push({ pathname: '/login', params: { next: `/subscribe/${slug}` } })} />
      </Screen>
    );
  }
  if (user.id === h.ownerId) {
    return <Screen><Empty title="This is your hostel">Plans are for people who live at a hostel, so you can’t take one at a hostel you own.</Empty></Screen>;
  }
  if (mine) {
    return (
      <Screen>
        <ErrorText>{err}</ErrorText>
        <ExistingPlan
          mine={mine}
          here={h}
          busy={busy}
          onPay={(invoiceId) => openPayment(invoiceId).then(reload, (e) => setErr(errorMessage(e)))}
          onRelease={async () => {
            setBusy(true);
            setErr(null);
            try {
              // Only a hold is released: if the bill was paid meanwhile, the running plan is left alone.
              const now = await api.me.subscription();
              if (!now || now.subscription.id !== mine.subscription.id || now.subscription.status !== 'pending') {
                throw new Error('There is no unpaid hold to release any more. This screen shows where things stand now.');
              }
              await api.me.cancelSubscription();
              setOk('The bed is released. Pick a room and food plan again.');
            } catch (e) {
              setErr(errorMessage(e));
            } finally {
              setBusy(false);
              reload();
            }
          }}
        />
      </Screen>
    );
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
      const res = await api.hostels.subscribe(h.id, { roomTypeId: room!.id, mealPlan: chosenPlan, diet });
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
      <Notice>{ok}</Notice>
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
        <Row style={{ justifyContent: 'space-between' }}><P>Advance / deposit</P><P>₹0</P></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontWeight: '700', color: theme.colors.text }}>First month</Text><Text style={{ fontWeight: '700', fontSize: 18, color: theme.colors.text }}>{rupees(bill.totalAmount)}</Text></Row>
        <P muted>
          Your plan starts today. We hold the bed for {PENDING_SUBSCRIPTION_TTL_MINUTES} minutes while you pay the first month; payment opens in your browser.
          After that, bills arrive five days before each month starts.
        </P>
      </Card>
      <ErrorText>{err}</ErrorText>
      <Button title="Continue to payment" onPress={go} busy={busy} />
    </Screen>
  );
}

/** The plan this person already has: a held bed to pay for or release, or a running plan they can move. */
function ExistingPlan({ mine, here, busy, onPay, onRelease }: { mine: MySubscription; here: { slug: string; name: string }; busy: boolean; onPay: (invoiceId: string) => void; onRelease: () => void }) {
  const sub = mine.subscription;
  const sameHostel = mine.hostel.slug === here.slug;
  if (sub.status === 'pending') {
    const hold = bedHold(sub.createdAt);
    const due = mine.invoices.find((i) => i.status === 'due');
    return (
      <Card>
        <H2>You’re holding a bed at {mine.hostel.name}</H2>
        <P>
          {SHARING_LABEL[mine.roomType.sharing]} · {FOOD_PLANS[sub.mealPlan].label}.{' '}
          {hold.ended ? 'The hold time is up, so the bed can be released at any moment.' : `We hold it until ${hold.until} while you pay the first month.`}{' '}
          {sameHostel ? 'Pay to confirm it, or release it to pick another room or food plan.' : `To take a plan at ${here.name} instead, release that bed first.`}
        </P>
        {due && <Button title={`Pay ${rupees(due.totalAmount)}`} onPress={() => onPay(due.id)} />}
        <Button variant="secondary" title="Release the bed and choose again" busy={busy} onPress={onRelease} />
      </Card>
    );
  }
  return (
    <>
      <Empty title={sameHostel ? `You already live at ${mine.hostel.name}` : `You already have a plan at ${mine.hostel.name}`}>
        {sub.cancelAt
          ? `Your plan ends on ${dateLabel(sub.cancelAt)}. You can take a new plan after that.`
          : sameHostel
            ? 'To change your room, use Move on My Stay. It applies from your next bill.'
            : 'You can hold one plan at a time. Moving keeps it running: the new room’s rent starts from your next bill, with no fee.'}
      </Empty>
      {!sub.cancelAt && sub.status === 'active' && <Button title={sameHostel ? 'Move room' : `Move to ${here.name}`} onPress={() => router.push('/move')} />}
      <Button variant="secondary" title="My Stay" onPress={() => router.replace('/stay')} />
    </>
  );
}
