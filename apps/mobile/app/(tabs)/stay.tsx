import { dateLabel, FOOD_PLANS, type Invoice, type MyMenu, type MyResidency, type MySubscription, rupees, SHARING_LABEL, weekday } from '@hostels/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorText, H2, Loading, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openPayment } from '@/lib/pay';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Data = { mine: MySubscription | null; menu: MyMenu | null; invoices: Invoice[]; stays: MyResidency[] };

function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [{ text: 'Not now', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: onYes }]);
}

export default function MyStay() {
  const { user, ready } = useAuth();
  const { data, error, loading, refreshing, refresh, reload } = useLoad<Data | null>(async () => {
    if (!user) return null;
    const isTenant = user.role === 'tenant';
    const [mine, stays] = await Promise.all([isTenant ? api.me.subscription() : null, api.me.residencies()]);
    const active = mine?.subscription.status === 'active';
    const [menu, invoices] = await Promise.all([
      active && mine.subscription.mealPlan !== 'none' ? api.me.menu(7).catch(() => null) : null,
      isTenant ? api.me.invoices() : [],
    ]);
    return { mine, menu, invoices, stays };
  }, [user?.id]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusyKey(key);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusyKey(null);
    }
  }

  if (!ready || (user && loading)) return <Loading />;
  if (!user) {
    return (
      <Screen>
        <Empty title="Your stay lives here">Log in to see your plan, this week's menu, bills and your hostel community.</Empty>
        <Button title="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }
  if (!data) return <Screen><ErrorText>{error}</ErrorText></Screen>;
  const { mine, menu, invoices, stays } = data;
  const sub = mine?.subscription;
  const due = invoices.find((i) => i.status === 'due');
  const homes = stays.filter((s) => s.status === 'active' || s.status === 'invited' || (s.status === 'ended' && s.canReview));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ErrorText>{actionError ?? error}</ErrorText>

      {due && (
        <Card tone="food">
          <Text style={{ fontWeight: '700', color: theme.colors.text }}>{due.isOverdue ? 'Your bill is overdue' : 'A bill is ready'}</Text>
          <P>{rupees(due.totalAmount)} for {dateLabel(due.periodStart)} – {dateLabel(due.periodEnd)}, due {dateLabel(due.dueDate)}</P>
          <Button title={`Pay ${rupees(due.totalAmount)}`} variant="food" busy={busyKey === 'pay'} onPress={() => act('pay', () => openPayment(due.id))} />
        </Card>
      )}

      {mine && sub ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.push(`/hostel/${mine.hostel.slug}`)}><H2>{mine.hostel.name}</H2></Pressable>
            <StatusBadge status={sub.status} />
          </Row>
          <P>{mine.hostel.area} · {SHARING_LABEL[mine.roomType.sharing]} · {FOOD_PLANS[sub.mealPlan].label}{sub.mealPlan !== 'none' ? ` (${sub.diet})` : ''}</P>
          <P muted>This period {dateLabel(mine.currentPeriod.start)} – {dateLabel(mine.currentPeriod.end)} · rent {rupees(mine.roomType.monthlyRent)}</P>
          {sub.cancelAt && <Badge label={`Ends ${dateLabel(sub.cancelAt)}`} tone="food" />}
          {mine.scheduledMove && (
            <Row style={{ justifyContent: 'space-between' }}>
              <P>Moving on {dateLabel(mine.scheduledMove.moveDate)}</P>
              <Button small variant="secondary" title="Cancel move" busy={busyKey === 'move'} onPress={() => act('move', () => api.me.cancelMove(mine.scheduledMove!.id))} />
            </Row>
          )}
          {sub.status === 'active' && !sub.cancelAt && (
            <Row>
              {!mine.scheduledMove && <Button small variant="secondary" title="Move" onPress={() => router.push('/move')} />}
              <Button
                small
                variant="ghost"
                title="Cancel plan"
                busy={busyKey === 'cancel'}
                onPress={() => confirm('Cancel your plan?', 'It ends at the close of this billing period. Your bed is released then.', () => act('cancel', () => api.me.cancelSubscription()))}
              />
            </Row>
          )}
        </Card>
      ) : user.role === 'tenant' ? (
        <Empty title="No plan yet">Verified hostels offer one monthly bill for bed and food, with no advance.</Empty>
      ) : null}

      {menu && (
        <View style={{ gap: theme.spacing.sm }}>
          <H2>Meals</H2>
          <P muted>Skip before the cut-off and the credit comes off your next bill.</P>
          {menu.days.map((d) => (
            <Card key={d.date}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: theme.colors.text }}>{weekday(d.date)}, {dateLabel(d.date)}</Text>
                {d.theme ? <Badge label={d.theme} tone="food" /> : null}
              </Row>
              {d.meals.filter((m) => m.inPlan).map((m) => {
                const key = `${d.date}|${m.meal}`;
                const dish = (menu.diet === 'non-veg' && m.nonVegDish) || m.vegDish || 'Menu not posted yet';
                return (
                  <Row key={m.meal} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: theme.colors.text, textTransform: 'capitalize' }}>{m.meal}</Text>
                      <Text style={{ color: m.skipped ? theme.colors.muted : theme.colors.soft, textDecorationLine: m.skipped ? 'line-through' : 'none' }}>{dish}</Text>
                    </View>
                    {m.canChange ? (
                      <Button
                        small
                        variant={m.skipped ? 'secondary' : 'ghost'}
                        title={m.skipped ? 'Undo' : `Skip −${rupees(m.credit)}`}
                        busy={busyKey === key}
                        onPress={() => act(key, () => (m.skipped ? api.me.unskip(d.date, m.meal) : api.me.skip({ date: d.date, meal: m.meal })))}
                      />
                    ) : (
                      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{m.skipped ? 'Skipped' : 'Locked'}</Text>
                    )}
                  </Row>
                );
              })}
            </Card>
          ))}
        </View>
      )}

      {homes.length > 0 && (
        <View style={{ gap: theme.spacing.sm }}>
          <H2>Hostel life</H2>
          {homes.map((s) => (
            <Pressable key={s.id} onPress={() => router.push(`/home/${s.hostel.id}`)}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', color: theme.colors.text }}>{s.hostel.name}</Text>
                  <StatusBadge status={s.status} />
                </Row>
                <P muted>{s.status === 'invited' ? 'Your hostel added you. Tap to accept.' : s.status === 'ended' ? 'Review your stay' : 'Issues, community and neighbours'}</P>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {invoices.length > 0 && (
        <View style={{ gap: theme.spacing.sm }}>
          <H2>Bills</H2>
          {invoices.map((i) => (
            <Card key={i.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>{dateLabel(i.periodStart)} – {dateLabel(i.periodEnd)}</Text>
                <StatusBadge status={i.isOverdue ? 'overdue' : i.status} />
              </Row>
              <P muted>Rent {rupees(i.rentAmount)} · food {rupees(i.foodAmount)}{i.creditAmount ? ` · credit −${rupees(i.creditAmount)}` : ''}</P>
              <Text style={{ fontWeight: '700', color: theme.colors.text }}>{rupees(i.totalAmount)}</Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
