import { type AdminPaymentException, dateLabel, FOOD_PLANS, OWNER_PLANS, PAYMENT_MODE_LABEL, REFUND_REASON_LABEL, rupees } from '@hostels/shared';
import { Stack } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { whileLoading } from '@/components/owner/parts';
import { Button, Card, ErrorText, Field, Notice, P, Row, Screen, Segmented, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm, useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Tab = 'overdue' | 'subs' | 'moves' | 'owner' | 'refunds';

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
    const [subs, overdue, ownerBills, moves, refunds] = await Promise.all([
      api.admin.subscriptions(),
      api.admin.overdue(),
      api.admin.ownerInvoices(),
      api.admin.moves(),
      api.admin.paymentExceptions(),
    ]);
    return { subs, overdue, ownerBills, moves, refunds };
  });
  const gate = whileLoading(s);
  if (gate) return gate;
  const { subs, overdue, ownerBills, moves, refunds } = s.data!;
  const scheduled = moves.filter((m) => m.status === 'scheduled').length;
  const refundsDue = refunds.filter((r) => r.status === 'refund_due').length;

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
          { value: 'refunds', label: `Refunds (${refundsDue})` },
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
          <Row>
            <Title>{b.hostelName} · {OWNER_PLANS[b.plan].label}</Title>
            <StatusBadge status={b.isOverdue ? 'overdue' : b.status === 'void' ? (b.paymentMode === 'waived' ? 'waived' : 'cancelled') : b.status} />
          </Row>
          <P muted>
            {rupees(b.amount)} · {dateLabel(b.periodStart)} – {dateLabel(b.periodEnd)}
            {b.status === 'paid' && b.paymentMode && b.paymentMode !== 'razorpay_live' ? ` · ${PAYMENT_MODE_LABEL[b.paymentMode]}` : ''}
          </P>
        </Card>
      )))}
      {tab === 'refunds' && (
        <>
          <P muted>Payments that reached us after their bill had closed. Refund them in the Razorpay dashboard, then record it here.</P>
          {refunds.length === 0 ? <P muted>None. Every payment so far was applied to its bill.</P> : refunds.map((r) => <RefundCard key={r.id} refund={r} onDone={s.reload} />)}
        </>
      )}
    </Screen>
  );
}

function RefundCard({ refund: r, onDone }: { refund: AdminPaymentException; onDone: () => Promise<unknown> | void }) {
  const [note, setNote] = useState('');
  const a = useAction();
  return (
    <Card>
      <Row><Title>{r.payer.name || '—'} · {r.hostelName}</Title><StatusBadge status={r.status} /></Row>
      <P muted>
        +91 {r.payer.phone} · {rupees(r.amount)} · {PAYMENT_MODE_LABEL[r.paymentMode]} · received {dateLabel(r.createdAt)}
      </P>
      <P>{REFUND_REASON_LABEL[r.reason]}</P>
      {r.status === 'refunded' ? (
        <P muted>Refunded {dateLabel(r.refundedAt)}{r.refundNote ? ` · ${r.refundNote}` : ''}</P>
      ) : (
        <>
          <Field label="Refund reference" value={note} onChangeText={setNote} placeholder="Razorpay refund id or how it was paid back" />
          <ErrorText>{a.error}</ErrorText>
          <Notice>{a.ok}</Notice>
          <Button
            small
            variant="secondary"
            title="Mark refunded"
            disabled={note.trim().length < 3}
            busy={a.busy === r.id}
            onPress={async () => {
              if (!(await confirm('Record this payment as refunded?', 'Mark refunded'))) return;
              const done = await a.run(r.id, () => api.admin.markRefunded(r.id, note.trim()), 'Marked as refunded');
              if (done) await onDone();
            }}
          />
        </>
      )}
    </Card>
  );
}
