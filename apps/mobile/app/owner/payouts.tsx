import { dateLabel, monthLabel, rupees } from '@hostels/shared';
import { Stack } from 'expo-router';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { whileLoading } from '@/components/owner/parts';
import { Card, Empty, ErrorText, H2, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function PayoutsScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Payouts' }} />
      <Payouts />
    </RoleGate>
  );
}

function Payouts() {
  const s = useLoad(() => api.owner.payouts());
  const gate = whileLoading(s);
  if (gate) return gate;
  const data = s.data!;
  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Rent and food paid online by your subscribers, minus the platform fee. Paid out monthly.</P>
      <ErrorText>{s.error}</ErrorText>
      <H2>So far in {monthLabel(data.thisMonth.month)}</H2>
      {data.thisMonth.hostels.length === 0 ? <Empty title="No online payments yet this month" /> : data.thisMonth.hostels.map((h) => (
        <Card key={h.hostelId}>
          <Text style={{ fontWeight: '600', color: theme.colors.text }}>{h.hostelName}</Text>
          <P muted>Collected {rupees(h.grossAmount)} · fee −{rupees(h.platformFee)}</P>
          <Text style={{ fontWeight: '700', color: theme.colors.brand, fontSize: 18 }}>You get {rupees(h.netAmount)}</Text>
        </Card>
      ))}
      <H2>History</H2>
      {data.history.length === 0 ? <P muted>No payouts yet.</P> : data.history.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '600', color: theme.colors.text, flex: 1 }}>{monthLabel(p.periodMonth)} · {p.hostelName}</Text>
            <StatusBadge status={p.status} />
          </Row>
          <P muted>Collected {rupees(p.grossAmount)} · fee −{rupees(p.platformFee)} · net {rupees(p.netAmount)}{p.paidAt ? ` · paid ${dateLabel(p.paidAt)}` : ''}</P>
        </Card>
      ))}
    </Screen>
  );
}
