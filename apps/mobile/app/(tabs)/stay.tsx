import { dateLabel, FOOD_PLANS, type Invoice, type MyMenu, type MyResidency, type MySubscription, rupees, SHARING_LABEL, weekday } from '@hostels/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorState, ErrorText, H2, Loading, Notice, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { openPayment } from '@/lib/pay';
import { groupStays } from '@/lib/stay';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Data = { mine: MySubscription | null; menu: MyMenu | null; invoices: Invoice[]; stays: MyResidency[] };

const lifeTab = (hostelId: string, tab: string) => router.push({ pathname: '/home/[hostelId]', params: { hostelId, tab } });

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
  const [ok, setOk] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusyKey(key);
    setActionError(null);
    setOk(null);
    try {
      await fn();
      if (done) setOk(done);
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
        <Button title="Log in" onPress={() => router.push({ pathname: '/login', params: { next: '/stay' } })} />
      </Screen>
    );
  }
  if (!data) return <Screen refreshing={refreshing} onRefresh={refresh}><ErrorState message={error} onRetry={reload} /></Screen>;
  const { mine, menu, invoices, stays } = data;
  const sub = mine?.subscription;
  const due = invoices.find((i) => i.status === 'due');
  const { invites, current, past } = groupStays(stays);
  const pay = (i: Invoice) => act(`pay${i.id}`, () => openPayment(i.id));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <ErrorText>{actionError ?? error}</ErrorText>
      <Notice>{ok}</Notice>

      {due && (
        <Card tone="food">
          <Text style={{ fontWeight: '700', color: theme.colors.text }}>{due.isOverdue ? 'Your bill is overdue' : 'A bill is ready'}</Text>
          <P>{rupees(due.totalAmount)} for {dateLabel(due.periodStart)} – {dateLabel(due.periodEnd)}, due {dateLabel(due.dueDate)}</P>
          <Button title={`Pay ${rupees(due.totalAmount)}`} variant="food" busy={busyKey === `pay${due.id}`} onPress={() => pay(due)} />
          <P muted>Payment opens in your browser. Pull down to refresh when you're back.</P>
        </Card>
      )}

      {invites.map((s) => (
        <Card key={s.id} tone="brand">
          <Text style={{ fontWeight: '700', color: theme.colors.text }}>{s.hostel.name} added you as a resident</Text>
          <P>Since {dateLabel(s.startDate)}. Accept to join the hostel community and report issues.</P>
          <Row>
            <Button small title="Accept" busy={busyKey === `acc${s.id}`} onPress={() => act(`acc${s.id}`, () => api.me.acceptResidency(s.id), 'Welcome! You can now see your hostel community.')} />
            <Button small variant="ghost" title="Not me" busy={busyKey === `dec${s.id}`} onPress={() => act(`dec${s.id}`, () => api.me.declineResidency(s.id), 'Invite declined')} />
          </Row>
        </Card>
      ))}

      {mine && sub ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="link" onPress={() => router.push(`/hostel/${mine.hostel.slug}`)}><H2>{mine.hostel.name}</H2></Pressable>
            <StatusBadge status={sub.status} />
          </Row>
          <P>{mine.hostel.area} · {SHARING_LABEL[mine.roomType.sharing]} · {FOOD_PLANS[sub.mealPlan].label}{sub.mealPlan !== 'none' ? ` (${sub.diet})` : ''}</P>
          <P muted>Member since {dateLabel(sub.startDate)} · this period {dateLabel(mine.currentPeriod.start)} – {dateLabel(mine.currentPeriod.end)} · rent {rupees(mine.roomType.monthlyRent)} /month</P>
          {sub.cancelAt && <Badge label={`Ends ${dateLabel(sub.cancelAt)}`} tone="food" />}
          {sub.status === 'pending' && due && <P>Pay the first bill to confirm your bed. Unpaid holds are released after 30 minutes.</P>}
          {mine.scheduledMove && (
            <Row style={{ justifyContent: 'space-between' }}>
              <P>Moving on {dateLabel(mine.scheduledMove.moveDate)}</P>
              <Button small variant="secondary" title="Cancel move" busy={busyKey === 'move'} onPress={() => act('move', () => api.me.cancelMove(mine.scheduledMove!.id), 'Move cancelled')} />
            </Row>
          )}
          {sub.status === 'active' && !sub.cancelAt && (
            <Row>
              {!mine.scheduledMove && <Button small variant="secondary" title="Move hostel or room" onPress={() => router.push('/move')} />}
              <Button small variant="secondary" title="Hostel community" onPress={() => router.push(`/home/${mine.hostel.id}`)} />
              <Button
                small
                variant="ghost"
                title="Cancel plan"
                busy={busyKey === 'cancel'}
                onPress={() => confirm('Cancel your plan?', 'It ends at the close of this billing period. Your bed is released then.', () => act('cancel', () => api.me.cancelSubscription(), 'Your plan will end at the close of the current billing period.'))}
              />
            </Row>
          )}
        </Card>
      ) : user.role === 'tenant' && current.length === 0 && invites.length === 0 ? (
        <Card>
          <Empty title="You're not linked to a hostel yet">Subscribe to a verified hostel for one monthly bill with no advance, or ask your hostel owner to add your phone number.</Empty>
          <Button title="Browse verified hostels" onPress={() => router.push({ pathname: '/', params: { verified: 'true' } })} />
        </Card>
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
                        title={m.skipped ? 'Undo skip' : `Skip −${rupees(m.credit)}`}
                        busy={busyKey === key}
                        onPress={() => act(key, () => (m.skipped ? api.me.unskip(d.date, m.meal) : api.me.skip({ date: d.date, meal: m.meal })))}
                      />
                    ) : (
                      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{m.skipped ? `Skipped · −${rupees(m.credit)}` : 'Locked'}</Text>
                    )}
                  </Row>
                );
              })}
            </Card>
          ))}
        </View>
      )}

      {current.length > 0 && (
        <View style={{ gap: theme.spacing.sm }}>
          <H2>Hostel life</H2>
          {current.map((s) => (
            <Card key={s.id}>
              <Pressable accessibilityRole="link" onPress={() => router.push(`/home/${s.hostel.id}`)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', color: theme.colors.text }}>{s.hostel.name}</Text>
                  <StatusBadge status={s.status} />
                </Row>
                <P muted>{s.hostel.area} · since {dateLabel(s.startDate)} · community, issues and neighbours</P>
              </Pressable>
              <Row>
                <Button small title="Open" onPress={() => router.push(`/home/${s.hostel.id}`)} />
                <Button small variant="secondary" title="Report an issue" onPress={() => lifeTab(s.hostel.id, 'issues')} />
                {s.canReview && <Button small variant="secondary" title={s.hasReview ? 'Edit review' : 'Write a review'} onPress={() => lifeTab(s.hostel.id, 'review')} />}
                {s.source === 'owner' && (
                  <Button
                    small
                    variant="ghost"
                    title="I moved out"
                    busy={busyKey === `out${s.id}`}
                    onPress={() => confirm('Mark yourself as moved out?', 'You leave the community board. You can still review your stay.', () => act(`out${s.id}`, () => api.me.moveOut(s.id), 'Marked as moved out. You can still review your stay.'))}
                  />
                )}
              </Row>
            </Card>
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
              <P muted>Rent {rupees(i.rentAmount)} · food {rupees(i.foodAmount)}{i.creditAmount ? ` · skipped-meal credit −${rupees(i.creditAmount)}` : ''}</P>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: theme.colors.text }}>{rupees(i.totalAmount)}</Text>
                {i.status === 'due' ? <Button small variant="food" title="Pay" busy={busyKey === `pay${i.id}`} onPress={() => pay(i)} /> : <P muted>{i.status === 'paid' ? `Paid${i.paidAt ? ` ${dateLabel(i.paidAt)}` : ''}` : 'Replaced by a newer bill'}</P>}
              </Row>
            </Card>
          ))}
        </View>
      )}

      {past.length > 0 && (
        <View style={{ gap: theme.spacing.sm }}>
          <H2>Places you've lived</H2>
          {past.map((s) => (
            <Card key={s.id}>
              <Pressable accessibilityRole="link" onPress={() => router.push(`/hostel/${s.hostel.slug}`)}>
                <Text style={{ fontWeight: '700', color: theme.colors.text }}>{s.hostel.name}</Text>
                <P muted>{dateLabel(s.startDate)} – {dateLabel(s.endDate)}</P>
              </Pressable>
              {s.canReview ? (
                <Button small variant="secondary" title={s.hasReview ? 'Edit review' : 'Review your stay'} onPress={() => lifeTab(s.hostel.id, 'review')} />
              ) : s.hasReview ? <Badge label="Reviewed" tone="green" /> : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
