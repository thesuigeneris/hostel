import { DEFAULT_PLATFORM_FEE_PCT, type Hostel, rupees } from '@hostels/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { Muted, whileLoading } from '@/components/owner/parts';
import { Button, Card, Empty, ErrorText, Field, H2, Notice, P, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { feeOn, parseFee } from '@/lib/owner';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function AdminPartnersScreen() {
  return (
    <RoleGate need="admin">
      <Stack.Screen options={{ title: 'Partners' }} />
      <AdminPartners />
    </RoleGate>
  );
}

function AdminPartners() {
  const s = useLoad(async () => {
    const [applied, verified] = await Promise.all([api.admin.hostels({ partnerStatus: 'applied' }), api.admin.hostels({ partnerStatus: 'verified' })]);
    return { applied, verified };
  });
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const { applied, verified } = s.data!;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Visit in person before verifying: photos match, rooms are clean, the kitchen is safe.</P>
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      <H2>Applications</H2>
      {applied.length === 0 ? <Empty title="No pending applications" /> : applied.map((h) => <Application key={h.id} h={h} a={a} onDone={s.reload} />)}
      <H2>Verified partners</H2>
      {verified.length === 0 ? <P muted>None yet.</P> : verified.map((h) => <FeeRow key={`${h.id}-${h.platformFeePct}`} h={h} a={a} onDone={s.reload} />)}
    </Screen>
  );
}

function Application({ h, a, onDone }: { h: Hostel; a: ReturnType<typeof useAction>; onDone: () => void }) {
  const [fee, setFee] = useState(String(DEFAULT_PLATFORM_FEE_PCT));
  const [reason, setReason] = useState('');
  const pct = parseFee(fee);
  return (
    <Card>
      <Text style={{ fontWeight: '700', color: theme.colors.text, fontSize: 16 }}>{h.name}</Text>
      <P muted>{h.area} · +91 {h.contactPhone} · {h.status}</P>
      {h.status === 'live' && <Button small variant="ghost" title="Public page" onPress={() => router.push(`/hostel/${h.slug}`)} />}
      <Field label="Platform fee %" hint="0 to 50, in steps of 0.5." value={fee} onChangeText={setFee} keyboardType="decimal-pad" maxLength={4} />
      <Button title="Verify partner" disabled={pct === null} busy={a.busy === `v-${h.id}`} onPress={() => a.run(`v-${h.id}`, async () => { await api.admin.verifyPartner(h.id, pct!); await onDone(); }, 'Partner verified')} />
      <Field label="Reason to decline" hint="The owner sees this." value={reason} onChangeText={setReason} maxLength={500} />
      <Button
        title="Decline"
        variant="danger"
        disabled={reason.trim().length < 3}
        busy={a.busy === `r-${h.id}`}
        onPress={() => a.run(`r-${h.id}`, async () => { await api.admin.rejectPartner(h.id, reason.trim()); await onDone(); }, 'Application declined')}
      />
    </Card>
  );
}

function FeeRow({ h, a, onDone }: { h: Hostel; a: ReturnType<typeof useAction>; onDone: () => void }) {
  const [fee, setFee] = useState(String(h.platformFeePct));
  const pct = parseFee(fee);
  return (
    <Card>
      <Text style={{ fontWeight: '600', color: theme.colors.text }}>{h.name}</Text>
      <P muted>{h.area}</P>
      <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <Field label="Fee %" value={fee} onChangeText={setFee} keyboardType="decimal-pad" maxLength={4} style={{ width: 90 }} />
        <Button small title="Save" variant="secondary" disabled={pct === null || pct === h.platformFeePct} busy={a.busy === `f-${h.id}`} onPress={() => a.run(`f-${h.id}`, async () => { await api.admin.setFee(h.id, pct!); await onDone(); }, 'Fee updated')} />
      </Row>
      {pct !== null && <Muted>On {rupees(10000)} rent = {rupees(feeOn(10000, pct))}</Muted>}
    </Card>
  );
}
