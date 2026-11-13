import { dateLabel, OWNER_BILLING_RULES, OWNER_PLAN_FEATURES, OWNER_PLANS, type OwnerInvoice, PAYMENT_MODE_LABEL, pausesOn, planPriceLine, rupees } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { HostelHeader, Muted, whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, ErrorText, H2, Notice, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { planChangedMessage, planChoices } from '@/lib/owner';
import { confirm, useAction } from '@/lib/ownerAction';
import { openPayment } from '@/lib/pay';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function PlanScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Plan and billing' }} />
      <Plan />
    </RoleGate>
  );
}

function Plan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useLoad(async () => {
    const [info, h] = await Promise.all([api.owner.plan(id), api.owner.hostel(id)]);
    return { info, h };
  }, [id]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const { info, h } = s.data!;
  const current = info.plan?.plan ?? 'free';
  const unpaid = info.bills.filter((b) => b.status === 'due').sort((x, y) => x.dueDate.localeCompare(y.dueDate));
  const due = unpaid[0];
  const scheduled = info.plan?.pendingPlan && info.plan.pendingPlanOn ? info.plan : null;
  // The bill is paid on the website's checkout page; the bills reload when the browser closes.
  const pay = (b: OwnerInvoice) =>
    a.run(`pay-${b.id}`, async () => {
      await openPayment(b.id);
      await s.reload();
    });

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      {info.plan?.suspended && (
        <Card tone="danger">
          <H2>Paid features are paused</H2>
          <P>A plan bill is more than 15 days overdue, so this hostel has the Free features for now. Your listing, residents and records are kept, and everything comes back the moment the bill is paid.</P>
        </Card>
      )}
      {due && (
        <Card tone="food">
          <H2>{due.isOverdue ? 'Your plan bill is overdue' : 'Plan bill ready'}</H2>
          <P>
            {rupees(due.amount)} for {dateLabel(due.periodStart)} – {dateLabel(due.periodEnd)}, due {dateLabel(due.dueDate)}.
            {info.plan?.suspended ? '' : ` Unpaid on ${dateLabel(pausesOn(due.dueDate))}, paid features pause.`}
            {unpaid.length > 1 ? ` ${unpaid.length} bills unpaid, ${rupees(unpaid.reduce((n, b) => n + b.amount, 0))} in all.` : ''}
          </P>
          <Button title="Pay now" variant="food" busy={a.busy === `pay-${due.id}`} onPress={() => pay(due)} />
        </Card>
      )}
      {scheduled && (
        <Card>
          <P>
            Switching to {OWNER_PLANS[scheduled.pendingPlan!].label} on {dateLabel(scheduled.pendingPlanOn)}, at the end of the month you paid for. Choose {OWNER_PLANS[current].label} below to keep your current plan.
          </P>
        </Card>
      )}
      {info.inTrial && info.plan?.trialEndsOn && (
        <Card tone="brand"><P>Free month until {dateLabel(info.plan.trialEndsOn)}. Your first bill comes after that, 5 days ahead of its month.</P></Card>
      )}

      {planChoices(info, h.status).map((c) => (
        <Card key={c.tier} style={c.current ? { borderColor: theme.colors.brand, borderWidth: 2 } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>{OWNER_PLANS[c.tier].label}</H2>
            {c.current && <Badge label="Current" tone="green" />}
          </Row>
          <Text style={{ fontSize: 22, fontWeight: '700', color: theme.colors.text }}>
            {OWNER_PLANS[c.tier].price ? rupees(OWNER_PLANS[c.tier].price) : '₹0'}
            <Text style={{ fontSize: 13, fontWeight: '400', color: theme.colors.muted }}> /month</Text>
          </Text>
          <Muted>{planPriceLine(c.tier)}</Muted>
          {OWNER_PLAN_FEATURES[c.tier].features.map((f) => (
            <P key={f}>✓ {f}</P>
          ))}
          {c.note ? <P muted>{c.note}</P> : null}
          {c.action && (
            <Button
              title={c.action.label}
              variant={c.action.primary ? 'primary' : 'secondary'}
              busy={a.busy === `plan-${c.tier}`}
              onPress={async () => {
                if (c.action?.confirm && !(await confirm(c.action.confirm, 'Downgrade'))) return;
                a.run(`plan-${c.tier}`, async () => {
                  const next = await api.owner.changePlan(id, c.tier);
                  s.setData({ h: await api.owner.hostel(id), info: next });
                }, planChangedMessage(c.tier));
              }}
            />
          )}
        </Card>
      ))}

      <H2>How billing works</H2>
      {OWNER_BILLING_RULES.map((r) => (
        <P key={r} muted>• {r}</P>
      ))}

      <H2>Plan bills</H2>
      {info.bills.length === 0 ? (
        <P muted>No bills yet.{current === 'free' ? ' Free has no bills.' : info.inTrial ? ' The first one comes after the free month.' : ''}</P>
      ) : (
        info.bills.map((b) => (
          <Card key={b.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text, flexShrink: 1 }}>{rupees(b.amount)} · {OWNER_PLANS[b.plan].label}</Text>
              <StatusBadge status={b.isOverdue ? 'overdue' : b.paymentMode === 'waived' ? 'waived' : b.status} />
            </Row>
            <P muted>{dateLabel(b.periodStart)} – {dateLabel(b.periodEnd)} · due {dateLabel(b.dueDate)}</P>
            {b.creditAmount > 0 && <P muted>{rupees(b.amount + b.creditAmount)} − {rupees(b.creditAmount)} credit</P>}
            {b.note ? <P muted>{b.note}</P> : null}
            {b.status === 'paid' && b.paymentMode && b.paymentMode !== 'razorpay_live' ? <Muted>{PAYMENT_MODE_LABEL[b.paymentMode]}</Muted> : null}
            {b.status === 'due' && <Button small title={`Pay ${rupees(b.amount)}`} busy={a.busy === `pay-${b.id}`} onPress={() => pay(b)} />}
          </Card>
        ))
      )}
    </Screen>
  );
}
