import { type RoomType, SHARING_LABEL, SHARING_TYPES, type SharingType } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { Choice, HostelHeader, whileLoading } from '@/components/owner/parts';
import { Button, Card, Empty, ErrorText, Field, H2, Notice, P, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { type RoomDraft, roomNumbers } from '@/lib/owner';
import { confirm, useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function RoomsScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Rooms and free beds' }} />
      <Rooms />
    </RoleGate>
  );
}

const toDraft = (r?: RoomType): RoomDraft => ({
  monthlyRent: r ? String(r.monthlyRent) : '',
  advanceAmount: r ? String(r.advanceAmount) : '0',
  totalBeds: r ? String(r.totalBeds) : '',
  bedsAvailable: r ? String(r.bedsAvailable) : '',
});

function Rooms() {
  const { id, ok } = useLocalSearchParams<{ id: string; ok?: string }>();
  const s = useLoad(() => api.owner.hostel(id), [id]);
  const a = useAction();
  const [sharing, setSharing] = useState<SharingType | null>(null);
  const [draft, setDraft] = useState<RoomDraft>(toDraft());
  const gate = whileLoading(s);
  if (gate) return gate;
  const h = s.data!;
  const unused = SHARING_TYPES.filter((t) => !h.roomTypes.some((r) => r.sharing === t));
  const pick = sharing && unused.includes(sharing) ? sharing : unused[0] ?? null;

  function add() {
    const n = roomNumbers(draft);
    if (!n.ok) return a.setError(n.error);
    if (!pick) return;
    a.run('add', async () => {
      await api.owner.addRoom(id, { sharing: pick, ...n.value });
      setDraft(toDraft());
      setSharing(null);
      await s.reload();
    }, 'Room added');
  }

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      {!a.ok && !a.error && ok ? <Notice>{ok}</Notice> : null}
      <P muted>Update free beds whenever someone moves in or out. Tenants see the count live.{h.isVerified ? ' Partner hostels: beds also update on their own as tenants subscribe and leave.' : ''}</P>
      <ErrorText>{a.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      {h.roomTypes.length === 0 && <Empty title="No rooms yet">Add each kind of room you have, with its rent and beds.</Empty>}
      {h.roomTypes.map((r) => <RoomCard key={`${r.id}-${r.monthlyRent}-${r.bedsAvailable}-${r.totalBeds}-${r.advanceAmount}`} room={r} a={a} onChanged={s.reload} />)}

      {unused.length > 0 && (
        <Card style={{ borderStyle: 'dashed' }}>
          <H2>Add a room type</H2>
          <Choice value={pick} options={unused.map((t) => ({ value: t, label: SHARING_LABEL[t] }))} onChange={setSharing} />
          <RoomFields d={draft} onChange={setDraft} />
          <Button title="Add room" busy={a.busy === 'add'} onPress={add} />
        </Card>
      )}
    </Screen>
  );
}

function RoomCard({ room, a, onChanged }: { room: RoomType; a: ReturnType<typeof useAction>; onChanged: () => Promise<void> | void }) {
  const [d, setD] = useState(toDraft(room));
  function save() {
    const n = roomNumbers(d);
    if (!n.ok) return a.setError(n.error);
    a.run(`save-${room.id}`, async () => {
      await api.owner.updateRoom(room.id, n.value);
      await onChanged();
    }, 'Room updated');
  }
  return (
    <Card>
      <H2>{SHARING_LABEL[room.sharing]}</H2>
      <RoomFields d={d} onChange={setD} />
      <Row>
        <Button small title="Save" variant="secondary" busy={a.busy === `save-${room.id}`} onPress={save} />
        <Button
          small
          title="Remove this room type"
          variant="ghost"
          busy={a.busy === `del-${room.id}`}
          onPress={async () => {
            if (!(await confirm(`Remove ${SHARING_LABEL[room.sharing]} from your listing?`, 'Remove'))) return;
            a.run(`del-${room.id}`, async () => {
              await api.owner.deleteRoom(room.id);
              await onChanged();
            }, 'Room removed');
          }}
        />
      </Row>
    </Card>
  );
}

function RoomFields({ d, onChange }: { d: RoomDraft; onChange: (d: RoomDraft) => void }) {
  const f = (k: keyof RoomDraft, label: string, placeholder?: string) => (
    <View style={{ flexGrow: 1, flexBasis: '45%' }}>
      <Field label={label} value={d[k]} onChangeText={(v) => onChange({ ...d, [k]: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder={placeholder} maxLength={7} />
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      {f('monthlyRent', 'Rent /month', '9000')}
      {f('advanceAmount', 'Advance')}
      {f('totalBeds', 'Total beds')}
      {f('bedsAvailable', 'Beds free')}
    </View>
  );
}
