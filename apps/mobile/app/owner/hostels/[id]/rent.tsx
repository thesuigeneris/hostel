import { ApiError, istDate, monthLabel, monthOf, RENT_METHODS, type RentSheet, rupees, titleCase } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { Choice, HostelHeader, Stat, StatGrid, Stepper, Upsell, whileLoading } from '@/components/owner/parts';
import { Button, Card, Empty, ErrorText, Field, Notice, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { rentDraft, rentInput, shiftMonth } from '@/lib/owner';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function RentScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Rent tracker' }} />
      <Rent />
    </RoleGate>
  );
}

function Rent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = istDate();
  const [month, setMonth] = useState(monthOf(today));
  const s = useLoad(async () => {
    const [h, sheet] = await Promise.all([
      api.owner.hostel(id),
      api.owner.rent(id, month).catch((e) => (e instanceof ApiError && e.code === 'plan_required' ? null : Promise.reject(e))),
    ]);
    return { h, sheet };
  }, [id, month]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const { h, sheet } = s.data!;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      {!sheet ? <Upsell hostelId={id} plan="pro" feature="The rent tracker" suspended={h.plan.suspended} /> : (
        <>
          <Stepper label={monthLabel(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
          <P muted>Tracks rent you collect yourself. Subscribers of partner hostels pay online and aren't listed here.</P>
          <StatGrid>
            <Stat label={`Due in ${monthLabel(month)}`} value={rupees(sheet.totals.due)} />
            <Stat label="Collected" value={rupees(sheet.totals.collected)} />
            <Stat label="Still unpaid" value={rupees(sheet.totals.unpaid)} />
          </StatGrid>
          <ErrorText>{a.error ?? s.error}</ErrorText>
          <Notice>{a.ok}</Notice>
          {sheet.rows.length === 0 ? <Empty title="No residents for this month">Add them in Residents.</Empty> : sheet.rows.map((r) => (
            <RentRow key={`${month}-${r.residencyId}-${r.amountPaid}-${r.paidOn}`} row={r} month={month} today={today} hostelId={id} a={a} onSaved={s.reload} />
          ))}
        </>
      )}
    </Screen>
  );
}

function RentRow({ row, month, today, hostelId, a, onSaved }: { row: RentSheet['rows'][number]; month: string; today: string; hostelId: string; a: ReturnType<typeof useAction>; onSaved: () => void }) {
  const [d, setD] = useState(() => rentDraft(row, today));
  function save() {
    const c = rentInput(d, month);
    if (!c.ok) return a.setError(c.error);
    a.run(`rent-${row.residencyId}`, async () => {
      await api.owner.recordRent(hostelId, row.residencyId, c.value);
      await onSaved();
    }, 'Rent recorded');
  }
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: theme.colors.text, fontWeight: '600', flex: 1 }}>{row.name || '—'}</Text>
        <StatusBadge status={row.status === 'unpaid' ? 'due' : row.status} />
      </Row>
      <P muted>+91 {row.phone} · due {rupees(row.amountDue)}</P>
      <Field label="Amount paid" keyboardType="number-pad" value={d.amountPaid} onChangeText={(v) => setD({ ...d, amountPaid: v.replace(/\D/g, '') })} maxLength={7} />
      <Field label="Paid on" hint="YYYY-MM-DD. Leave empty if not paid." value={d.paidOn} onChangeText={(v) => setD({ ...d, paidOn: v })} maxLength={10} />
      <Choice label="How" value={d.method} options={RENT_METHODS.map((m) => ({ value: m, label: m === 'upi' ? 'UPI' : titleCase(m) }))} onChange={(method) => setD({ ...d, method })} />
      <Field label="Note" value={d.note} onChangeText={(note) => setD({ ...d, note })} maxLength={300} />
      <Button small title="Save" variant="secondary" busy={a.busy === `rent-${row.residencyId}`} onPress={save} />
    </Card>
  );
}
