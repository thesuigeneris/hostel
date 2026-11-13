import { changeValueText, dateLabel, type ListingChange, timeAgo } from '@hostels/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, Empty, ErrorText, P, Screen, Segmented } from '@/components/ui';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function AdminChangesScreen() {
  return (
    <RoleGate need="admin">
      <Stack.Screen options={{ title: 'Recently changed' }} />
      <AdminChanges />
    </RoleGate>
  );
}

function AdminChanges() {
  const [only, setOnly] = useState<'all' | 'recheck'>('all');
  const s = useLoad(() => api.admin.listingChanges({ recheck: only === 'recheck' || undefined }), [only]);
  const gate = whileLoading(s);
  if (gate) return gate;
  const changes = s.data!;
  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Live listings stay live when owners edit them. Name, address, map pin, who can stay, food and phone changes are listed here so you can check them.</P>
      <ErrorText>{s.error}</ErrorText>
      <Segmented value={only} onChange={setOnly} options={[{ value: 'all', label: 'All changes' }, { value: 'recheck', label: 'Partners to check again' }]} />
      {changes.length === 0 ? (
        <Empty title={only === 'recheck' ? 'No partner needs a new check' : 'No changes to live listings'} />
      ) : (
        changes.map((ch) => <ChangeCard key={ch.id} ch={ch} />)
      )}
    </Screen>
  );
}

function ChangeCard({ ch }: { ch: ListingChange }) {
  const who = ch.changedBy ? (ch.changedBy.isOwner ? 'the owner' : `admin ${ch.changedBy.name || ch.changedBy.phone}`) : 'an account since removed';
  return (
    <Card>
      <Text style={{ fontWeight: '700', color: theme.colors.text }}>{ch.hostel.name}</Text>
      <P muted>{ch.hostel.area} · changed by {who} · {timeAgo(ch.createdAt)}</P>
      {ch.changes.map((c) => (
        <P key={c.field}>
          {c.label}: {changeValueText(c.field, c.before)} → {changeValueText(c.field, c.after)}
        </P>
      ))}
      {ch.partnerRecheck && <Badge label={ch.hostel.recheckSince ? `Partner check due since ${dateLabel(ch.hostel.recheckSince)}` : 'Partner checked again since'} tone={ch.hostel.recheckSince ? 'food' : 'gray'} />}
      {ch.hostel.recheckSince && <Button small variant="secondary" title="Record the new check" onPress={() => router.push('/admin/partners')} />}
    </Card>
  );
}
