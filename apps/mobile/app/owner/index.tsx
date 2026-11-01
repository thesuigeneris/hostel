import { OWNER_PLANS, rupees } from '@hostels/shared';
import { router, Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { NavRow, Stat, StatGrid, whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, Empty, ErrorText, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { dashboardStats, minRent } from '@/lib/owner';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function OwnerHomeScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Your hostels' }} />
      <OwnerHome />
    </RoleGate>
  );
}

function OwnerHome() {
  const s = useLoad(async () => {
    const [hostels, visits, issues] = await Promise.all([api.owner.hostels(), api.owner.visits('new'), api.owner.issues()]);
    const details = await Promise.all(hostels.map((h) => api.owner.hostel(h.id)));
    return { details, visits, issues };
  });
  const gate = whileLoading(s);
  if (gate) return gate;
  const { details, visits, issues } = s.data!;
  const stats = dashboardStats(details, visits.length, issues);

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <ErrorText>{s.error}</ErrorText>
      {details.length === 0 ? (
        <Empty title="List your first hostel">It takes about five minutes: details, a pin on the map, rooms and a few photos.</Empty>
      ) : (
        <StatGrid>
          <Stat label="Hostels" value={stats.hostels} hint={`${stats.live} live`} />
          <Stat label="Free beds" value={stats.freeBeds} hint="Keep this current" />
          <Stat label="New visit requests" value={stats.newVisits} onPress={() => router.push('/owner/visits')} />
          <Stat label="Open issues" value={stats.openIssues} hint={stats.waiting ? `${stats.waiting} waiting for your reply` : 'All answered'} onPress={() => router.push('/owner/issues')} />
        </StatGrid>
      )}
      <Button title="Add a hostel" onPress={() => router.push('/owner/hostels/new')} />

      {details.map((h) => (
        <Pressable key={h.id} accessibilityRole="link" accessibilityLabel={`Manage ${h.name}`} onPress={() => router.push(`/owner/hostels/${h.id}`)}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.text, flex: 1 }}>{h.name}</Text>
              <StatusBadge status={h.status} />
            </Row>
            <P muted>{h.area}</P>
            <Row>
              <Badge label={`${OWNER_PLANS[h.plan.effective].label} plan`} tone={h.plan.effective === 'free' ? 'gray' : 'green'} />
              {h.plan.suspended && <Badge label="Paused: bill overdue" tone="red" />}
              {h.isVerified && <Badge label="✓ Verified partner" tone="green" />}
              {h.partnerStatus === 'applied' && <Badge label="Partner review pending" tone="food" />}
            </Row>
            <P muted>
              {h.roomTypes.length} room types · {h.roomTypes.reduce((n, r) => n + r.bedsAvailable, 0)} beds free · from {rupees(minRent(h.roomTypes))}
              {h.ratings.rating !== null ? ` · ★ ${h.ratings.rating.toFixed(1)} (${h.ratings.reviewCount})` : ''}
            </P>
            {h.status === 'rejected' && h.rejectionReason ? <ErrorText>Not approved: {h.rejectionReason}</ErrorText> : null}
          </Card>
        </Pressable>
      ))}

      <NavRow title="Visit requests" hint="Call or WhatsApp back quickly" onPress={() => router.push('/owner/visits')} />
      <NavRow title="All issues" hint="Everything your residents reported" onPress={() => router.push('/owner/issues')} />
      <NavRow title="Payouts" hint="Online rent and food, minus the platform fee" onPress={() => router.push('/owner/payouts')} />
      <NavRow title="Plans for owners" hint="Free, Pro and Partner" onPress={() => router.push('/owner/join')} />
    </Screen>
  );
}
