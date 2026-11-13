import { dateLabel, istDate, monthLabel, notCountedLabel, rupees } from '@hostels/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { Stepper, whileLoading } from '@/components/owner/parts';
import { Button, Card, Empty, ErrorText, Notice, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { lastMonth, shiftMonth } from '@/lib/owner';
import { confirm, useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function AdminPayoutsScreen() {
  return (
    <RoleGate need="admin">
      <Stack.Screen options={{ title: 'Payouts' }} />
      <AdminPayouts />
    </RoleGate>
  );
}

function AdminPayouts() {
  const [month, setMonth] = useState(() => lastMonth(istDate()));
  const s = useLoad(async () => {
    const [payouts, revenue] = await Promise.all([api.admin.payouts(month), api.admin.revenue(month)]);
    return { payouts, leftOut: notCountedLabel(revenue.notCounted.tenant) };
  }, [month]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const { payouts, leftOut } = s.data!;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Generate after a month closes. Tenant bills paid that month through live Razorpay count, minus each hostel's fee.</P>
      <Stepper label={monthLabel(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
      {leftOut && <P muted>{leftOut}, so it is never paid out.</P>}
      <Button
        title={`Generate for ${monthLabel(month)}`}
        busy={a.busy === 'gen'}
        onPress={() => a.run('gen', async () => s.setData({ payouts: await api.admin.generatePayouts(month), leftOut }), 'Payouts generated')}
      />
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      {payouts.length === 0 ? <Empty title={`No payouts for ${monthLabel(month)} yet`} /> : payouts.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '600', color: theme.colors.text, flex: 1 }}>{p.hostelName}</Text>
            <StatusBadge status={p.status} />
          </Row>
          <P muted>Collected {rupees(p.grossAmount)} · fee {rupees(p.platformFee)} · net {rupees(p.netAmount)}{p.paidAt ? ` · paid ${dateLabel(p.paidAt)}` : ''}</P>
          {p.status === 'pending' && (
            <Button
              small
              variant="secondary"
              title="Mark paid"
              busy={a.busy === p.id}
              onPress={async () => {
                if (!(await confirm('Mark this payout as transferred?', 'Mark paid'))) return;
                a.run(p.id, async () => { await api.admin.markPayoutPaid(p.id); await s.reload(); }, 'Marked as paid');
              }}
            />
          )}
        </Card>
      ))}
    </Screen>
  );
}
