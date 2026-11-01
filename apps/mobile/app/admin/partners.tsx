import { type AdminPartnerApplication, DEFAULT_PLATFORM_FEE_PCT, dateLabel, type Hostel, type PartnerStandardId, rupees, standardsFor } from '@hostels/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { Muted, Toggle, whileLoading } from '@/components/owner/parts';
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
    const [applied, verified] = await Promise.all([api.admin.partnerApplications('applied'), api.admin.hostels({ partnerStatus: 'verified' })]);
    return { applied, verified };
  });
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const { applied, verified } = s.data!;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Visit in person before verifying. Tick each brand standard as you check it; progress is saved between visits.</P>
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      <H2>Applications</H2>
      {applied.length === 0 ? <Empty title="No pending applications" /> : applied.map((app) => <Application key={app.id} app={app} a={a} onDone={s.reload} />)}
      <H2>Verified partners</H2>
      {verified.length === 0 ? <P muted>None yet.</P> : verified.map((h) => <FeeRow key={`${h.id}-${h.platformFeePct}`} h={h} a={a} onDone={s.reload} />)}
    </Screen>
  );
}

function Application({ app, a, onDone }: { app: AdminPartnerApplication; a: ReturnType<typeof useAction>; onDone: () => void }) {
  const h = app.hostel;
  const standards = standardsFor(h.foodAvailable);
  const [checked, setChecked] = useState<PartnerStandardId[]>(app.checklist);
  const [note, setNote] = useState(app.note);
  const [fee, setFee] = useState(String(DEFAULT_PLATFORM_FEE_PCT));
  const [reason, setReason] = useState('');
  const pct = parseFee(fee);
  const done = standards.filter((st) => checked.includes(st.id)).length;
  const toggle = (id: PartnerStandardId, on: boolean) => setChecked((c) => (on ? [...c, id] : c.filter((x) => x !== id)));
  return (
    <Card>
      <Text style={{ fontWeight: '700', color: theme.colors.text, fontSize: 16 }}>{h.name}</Text>
      <P muted>{h.area} · owner {app.owner.name || '—'} +91 {app.owner.phone} · applied {dateLabel(app.appliedAt)}</P>
      {h.status === 'live' && <Button small variant="ghost" title="Public page" onPress={() => router.push(`/hostel/${h.slug}`)} />}
      <Text style={{ fontWeight: '600', color: theme.colors.text }}>Brand standards · {done} of {standards.length} checked</Text>
      {standards.map((st) => <Toggle key={st.id} label={st.label} value={checked.includes(st.id)} onChange={(on) => toggle(st.id, on)} />)}
      <Field label="Visit notes" hint="Only admins see these." value={note} onChangeText={setNote} multiline maxLength={1000} />
      <Button
        title="Save progress"
        variant="secondary"
        busy={a.busy === `c-${h.id}`}
        onPress={() => a.run(`c-${h.id}`, async () => { await api.admin.saveChecklist(h.id, checked, note); await onDone(); }, 'Inspection progress saved')}
      />
      <Field label="Platform fee %" hint="0 to 50, in steps of 0.5." value={fee} onChangeText={setFee} keyboardType="decimal-pad" maxLength={4} />
      <Button
        title="Verify partner"
        disabled={pct === null || done < standards.length}
        busy={a.busy === `v-${h.id}`}
        onPress={() => a.run(`v-${h.id}`, async () => { await api.admin.verifyPartner(h.id, pct!, { checklist: checked, note }); await onDone(); }, 'Partner verified')}
      />
      {done < standards.length && <Muted>Tick every standard to verify.</Muted>}
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
