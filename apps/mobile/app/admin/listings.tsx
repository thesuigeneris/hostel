import { dateLabel, GENDER_LABEL, type HostelDetail, HOSTEL_STATUSES, type HostelStatus, titleCase } from '@hostels/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { Choice, whileLoading } from '@/components/owner/parts';
import { Button, Card, Empty, ErrorText, Field, Notice, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function AdminListingsScreen() {
  return (
    <RoleGate need="admin">
      <Stack.Screen options={{ title: 'Listings' }} />
      <AdminListings />
    </RoleGate>
  );
}

function AdminListings() {
  const [status, setStatus] = useState<HostelStatus>('pending');
  const s = useLoad(async () => {
    const hostels = await api.admin.hostels({ status });
    return Promise.all(hostels.map((h) => api.admin.hostel(h.id)));
  }, [status]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const list = s.data!;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <Choice value={status} options={HOSTEL_STATUSES.map((v) => ({ value: v, label: titleCase(v) }))} onChange={setStatus} />
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      {list.length === 0 ? <Empty title={`No ${status} listings`} /> : list.map((h) => <ListingCard key={h.id} h={h} a={a} onDone={s.reload} />)}
    </Screen>
  );
}

function ListingCard({ h, a, onDone }: { h: HostelDetail; a: ReturnType<typeof useAction>; onDone: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.text, flex: 1 }}>{h.name}</Text>
        <StatusBadge status={h.status} />
      </Row>
      <P muted>{h.area} · {GENDER_LABEL[h.genderType]} · +91 {h.contactPhone} · created {dateLabel(h.createdAt)}</P>
      {h.address ? <P muted>{h.address}</P> : null}
      {h.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
          {h.photos.map((p) => <Image key={p.id} source={{ uri: p.url }} style={{ width: 128, height: 96, borderRadius: theme.radius.sm }} accessibilityLabel={h.name} />)}
        </ScrollView>
      )}
      <P numberOfLines={3}>{h.description || 'No description'}</P>
      <P muted>{h.roomTypes.map((r) => `${r.sharing} ₹${r.monthlyRent} (${r.bedsAvailable}/${r.totalBeds})`).join(' · ') || 'No rooms'}</P>
      {h.status === 'live' && <Button small variant="ghost" title="Public page" onPress={() => router.push(`/hostel/${h.slug}`)} />}
      {h.status === 'pending' && (
        <>
          <Button title="Approve" busy={a.busy === `ok-${h.id}`} onPress={() => a.run(`ok-${h.id}`, async () => { await api.admin.approve(h.id); await onDone(); }, 'Listing is live')} />
          <Field label="Reason to reject" hint="The owner sees this." value={reason} onChangeText={setReason} maxLength={500} placeholder="Why it can't go live" />
          <Button
            title="Reject"
            variant="danger"
            disabled={reason.trim().length < 3}
            busy={a.busy === `no-${h.id}`}
            onPress={() => a.run(`no-${h.id}`, async () => { await api.admin.reject(h.id, reason.trim()); await onDone(); }, 'Listing sent back to the owner')}
          />
        </>
      )}
    </Card>
  );
}
