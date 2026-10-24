import { dateLabel, FOOD_PLANS, OWNER_PLANS, rupees } from '@hostels/shared';
import { Stack } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { whileLoading } from '@/components/owner/parts';
import { Card, ErrorText, P, Row, Screen, Segmented, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Tab = 'overdue' | 'subs' | 'moves' | 'owner';

export default function AdminBillingScreen() {
  return (
    <RoleGate need="admin">
      <Stack.Screen options={{ title: 'Subscriptions and bills' }} />
      <AdminBilling />
    </RoleGate>
  );
}

const Title = ({ children }: { children: ReactNode }) => <Text style={{ fontWeight: '600', color: theme.colors.text, flex: 1 }}>{children}</Text>;

function AdminBilling() {
  const [tab, setTab] = useState<Tab>('overdue');
  const s = useLoad(async () => {
    const [subs, overdue, ownerBills, moves] = await Promise.all([api.admin.subscriptions(), api.admin.overdue(), api.admin.ownerInvoices(), api.admin.moves()]);
    return { subs, overdue, ownerBills, moves };
  });
  const gate = whileLoading(s);
  if (gate) return gate;
  const { subs, overdue, ownerBills, moves } = s.data!;
  const scheduled = moves.filter((m) => m.status === 'scheduled').length;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overdue', label: `Overdue (${overdue.length})` },
          { value: 'subs', label: `Subs (${subs.length})` },
          { value: 'moves', label: `Moves (${scheduled})` },
          { value: 'owner', label: 'Owner bills' },
        ]}
      />
      <ErrorText>{s.error}</ErrorText>
      {tab === 'overdue' && (overdue.length === 0 ? <P muted>Nothing overdue.</P> : overdue.map((o) => (
        <Card key={o.invoice.id}>
          <Row><Title>{o.userName || '—'} · {o.hostelName}</Title><StatusBadge status="overdue" /></Row>
          <P muted>+91 {o.phone} · {rupees(o.invoice.totalAmount)} · due {dateLabel(o.invoice.dueDate)}</P>
        </Card>
      )))}
      {tab === 'subs' && (subs.length === 0 ? <P muted>No subscriptions yet.</P> : subs.map((x) => (
        <Card key={x.subscription.id}>
          <Row><Title>{x.user.name || '—'} · {x.hostelName}</Title><StatusBadge status={x.subscription.status} /></Row>
          <P muted>
            +91 {x.user.phone} · {FOOD_PLANS[x.subscription.mealPlan].label} · since {dateLabel(x.subscription.startDate)}
            {x.subscription.cancelAt ? ` · ends ${dateLabel(x.subscription.cancelAt)}` : ''}
          </P>
        </Card>
      )))}
      {tab === 'moves' && (moves.length === 0 ? <P muted>No moves.</P> : moves.map((m) => (
        <Card key={m.id}>
          <Row><Title>Move on {dateLabel(m.moveDate)}</Title><StatusBadge status={m.status} /></Row>
          <P muted>Requested {dateLabel(m.createdAt)}</P>
        </Card>
      )))}
      {tab === 'owner' && (ownerBills.length === 0 ? <P muted>No owner bills yet.</P> : ownerBills.map((b) => (
        <Card key={b.id}>
          <Row><Title>{b.hostelName} · {OWNER_PLANS[b.plan].label}</Title><StatusBadge status={b.isOverdue ? 'overdue' : b.status} /></Row>
          <P muted>{rupees(b.amount)} · {dateLabel(b.periodStart)} – {dateLabel(b.periodEnd)}</P>
        </Card>
      )))}
    </Screen>
  );
}
