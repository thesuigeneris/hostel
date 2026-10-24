import { dateLabel, istDate, type Residency, rupees, SHARING_LABEL } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { Choice, HostelHeader, Upsell, whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, Empty, ErrorText, Field, H2, Notice, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { checkResident, hasPlan, isDate } from '@/lib/owner';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function ResidentsScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Residents' }} />
      <Residents />
    </RoleGate>
  );
}

function Residents() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = istDate();
  const s = useLoad(async () => {
    const [h, residents] = await Promise.all([api.owner.hostel(id), api.owner.residents(id)]);
    return { h, residents };
  }, [id]);
  const a = useAction();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [roomTypeId, setRoomTypeId] = useState<string>('');
  const [rent, setRent] = useState('');
  const [since, setSince] = useState(today);
  const [showPast, setShowPast] = useState(false);
  const gate = whileLoading(s);
  if (gate) return gate;
  const { h, residents } = s.data!;
  const canAdd = hasPlan(h.plan.effective, 'pro');
  const room = (rid: string | null) => h.roomTypes.find((r) => r.id === rid);
  const current = residents.filter((r) => r.status === 'active' || r.status === 'invited');
  const past = residents.filter((r) => r.status === 'ended' || r.status === 'declined');
  const rentValue = rent || String(room(roomTypeId || null)?.monthlyRent ?? h.roomTypes[0]?.monthlyRent ?? '');

  function add() {
    if (!/^\d+$/.test(rentValue)) return a.setError('Enter the monthly rent in rupees');
    const input = { phone, name, roomTypeId: roomTypeId || null, monthlyRent: Number(rentValue), startDate: since.trim() };
    const c = checkResident(input);
    if (!c.ok) return a.setError(c.error);
    a.run('add', async () => {
      await api.owner.addResident(id, c.value);
      setPhone('');
      setName('');
      setRent('');
      await s.reload();
    }, 'Resident added. They get an invite when they log in with this number.');
  }

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      {canAdd ? (
        <Card>
          <H2>Add a resident</H2>
          <P muted>They get an invite in the Hostels app when they log in with this number. Accepted residents can report issues, join the community and review after two weeks.</P>
          <Field label="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="98765 43210" maxLength={14} />
          <Field label="Name" value={name} onChangeText={setName} maxLength={80} />
          {h.roomTypes.length > 0 && (
            <Choice label="Room" value={roomTypeId} options={[{ value: '', label: '—' }, ...h.roomTypes.map((r) => ({ value: r.id, label: SHARING_LABEL[r.sharing] }))]} onChange={setRoomTypeId} />
          )}
          <Field label="Rent" keyboardType="number-pad" value={rentValue} onChangeText={(v) => setRent(v.replace(/\D/g, ''))} maxLength={7} />
          <Field label="Since" hint="YYYY-MM-DD" value={since} onChangeText={setSince} maxLength={10} />
          <Button title="Add resident" busy={a.busy === 'add'} disabled={phone.replace(/\D/g, '').length < 10} onPress={add} />
        </Card>
      ) : (
        <Upsell hostelId={id} plan="pro" feature="The resident register" suspended={h.plan.suspended} />
      )}

      <H2>Current residents</H2>
      {current.length === 0 ? <Empty title="No residents yet" /> : current.map((r) => (
        <ResidentCard key={r.id} r={r} roomLabel={room(r.roomTypeId) ? SHARING_LABEL[room(r.roomTypeId)!.sharing] : '—'} hostelId={id} a={a} onEnded={s.reload} today={today} />
      ))}

      {past.length > 0 && (
        <>
          <Button small variant="ghost" title={`${showPast ? 'Hide' : 'Show'} past residents (${past.length})`} onPress={() => setShowPast(!showPast)} />
          {showPast && past.map((r) => (
            <Card key={r.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{r.name || `+91 ${r.phone}`}</Text>
                <StatusBadge status={r.status} />
              </Row>
              <P muted>{dateLabel(r.startDate)} – {dateLabel(r.endDate)}</P>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

function ResidentCard({ r, roomLabel, hostelId, a, onEnded, today }: { r: Residency; roomLabel: string; hostelId: string; a: ReturnType<typeof useAction>; onEnded: () => void; today: string }) {
  const [end, setEnd] = useState(today);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: theme.colors.text, fontWeight: '600', flex: 1 }}>{r.name || '—'}</Text>
        <StatusBadge status={r.status} />
        {r.source === 'subscription' && <Badge label="Subscriber" tone="green" />}
      </Row>
      <P muted>+91 {r.phone} · {roomLabel} · {rupees(r.monthlyRent)} · since {dateLabel(r.startDate)}</P>
      {r.source === 'owner' && (open ? (
        <>
          <Field label="Moved out on" hint="YYYY-MM-DD" value={end} onChangeText={setEnd} maxLength={10} />
          <Row>
            <Button
              small
              title="Mark moved out"
              variant="danger"
              disabled={!isDate(end)}
              busy={a.busy === `end-${r.id}`}
              onPress={() => a.run(`end-${r.id}`, async () => {
                await api.owner.endResident(hostelId, r.id, end.trim());
                await onEnded();
              }, 'Marked as moved out')}
            />
            <Button small title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
          </Row>
        </>
      ) : (
        <Button small title="Moved out" variant="secondary" onPress={() => setOpen(true)} />
      ))}
    </Card>
  );
}
