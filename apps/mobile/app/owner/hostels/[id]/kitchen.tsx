import { addDays, dateLabel, FOOD_PLANS, istDate, SHARING_LABEL, weekday } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { HostelHeader, Muted, Stat, StatGrid, Stepper, Upsell, whileLoading } from '@/components/owner/parts';
import { Card, Empty, ErrorText, H2, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { hasPlan } from '@/lib/owner';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function KitchenScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Kitchen and subscribers' }} />
      <Kitchen />
    </RoleGate>
  );
}

function Kitchen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = istDate();
  const [date, setDate] = useState(today);
  const s = useLoad(async () => {
    const h = await api.owner.hostel(id);
    if (!hasPlan(h.plan.effective, 'partner')) return { h, count: null, subs: [] };
    const [count, subs] = await Promise.all([api.owner.headcount(id, date), api.owner.subscribers(id)]);
    return { h, count, subs };
  }, [id, date]);
  const gate = whileLoading(s);
  if (gate) return gate;
  const { h, count, subs } = s.data!;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      {!count ? <Upsell hostelId={id} plan="partner" feature="Subscriptions and kitchen headcount" suspended={h.plan.suspended} /> : (
        <>
          <ErrorText>{s.error}</ErrorText>
          <H2>Headcount</H2>
          <Stepper label={`${weekday(date)}, ${dateLabel(date)}${date === today ? ' (today)' : ''}`} onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} />
          <StatGrid>
            {count.meals.map((m) => (
              <Stat key={m.meal} label={m.meal} value={m.total} hint={`${m.veg} veg · ${m.nonVeg} non-veg${m.skipped > 0 ? ` · ${m.skipped} skipped` : ''}`} />
            ))}
          </StatGrid>
          <Muted>Counts lock at each meal's cut-off, so the number you see after it is final.</Muted>

          <H2>Subscribers</H2>
          {subs.length === 0 ? <Empty title="No subscribers yet">Verified partner hostels appear first in search with a Subscribe button.</Empty> : subs.map((sub) => (
            <Card key={sub.subscription.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.text, fontWeight: '600', flex: 1 }}>{sub.user.name || '—'}</Text>
                <StatusBadge status={sub.subscription.cancelAt ? 'cancelled' : sub.subscription.status} />
              </Row>
              <P muted>
                +91 {sub.user.phone} · {SHARING_LABEL[sub.sharing]} · {FOOD_PLANS[sub.subscription.mealPlan].label}
                {sub.subscription.mealPlan !== 'none' ? ` · ${sub.subscription.diet}` : ''} · since {dateLabel(sub.subscription.startDate)}
              </P>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
