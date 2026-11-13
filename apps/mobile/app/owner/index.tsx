import { istDate, type NextStep, OWNER_PLANS, ownerNextStep, rupees } from '@hostels/shared';
import { router, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { NavRow, Stat, StatGrid, whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, Empty, ErrorText, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { dashboardStats, minRent, sectionPath, waitingLabel } from '@/lib/owner';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

const STEP_TONE: Record<NextStep['tone'], { bg: string; border: string }> = {
  ok: { bg: theme.colors.bg, border: theme.colors.border },
  info: { bg: theme.colors.brandSoft, border: theme.colors.brandSoft },
  warn: { bg: theme.colors.foodSoft, border: theme.colors.food },
  danger: { bg: theme.colors.dangerSoft, border: theme.colors.danger },
};

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
    const [hostels, visits, issues, summary] = await Promise.all([
      api.owner.hostels(),
      api.owner.visits('new'),
      api.owner.issues(),
      api.owner.issueSummary().catch(() => ({ needsResponse: 0, byHostel: {} as Record<string, number> })),
    ]);
    const [details, insights] = await Promise.all([
      Promise.all(hostels.map((h) => api.owner.hostel(h.id))),
      Promise.all(hostels.map((h) => api.owner.insights(h.id).catch(() => null))),
    ]);
    return { details, insights, visits, issues, summary };
  });
  const gate = whileLoading(s);
  if (gate) return gate;
  const { details, insights, visits, issues, summary } = s.data!;
  const stats = dashboardStats(details, visits.length, issues);
  const today = istDate();

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <ErrorText>{s.error}</ErrorText>
      {details.length === 0 ? (
        <Empty title="List your first hostel">It takes about five minutes: details, a pin on the map, rooms and a few photos. Listing is free.</Empty>
      ) : (
        <StatGrid>
          <Stat label="Hostels" value={stats.hostels} hint={`${stats.live} live`} />
          <Stat label="Free beds" value={stats.freeBeds} hint="Keep this current" />
          <Stat label="New visit requests" value={stats.newVisits} onPress={() => router.push('/owner/visits')} />
          <Stat
            label="Open issues"
            value={stats.openIssues}
            hint={summary.needsResponse ? `${waitingLabel(summary.needsResponse)} for over a day` : 'None waiting for your reply'}
            onPress={() => router.push('/owner/issues')}
          />
        </StatGrid>
      )}
      <Button title={details.length ? 'Add a hostel' : 'List your hostel free'} onPress={() => router.push('/owner/hostels/new')} />

      {details.map((h, n) => {
        const step = ownerNextStep(
          {
            status: h.status,
            rejectionReason: h.rejectionReason,
            partnerStatus: h.partnerStatus,
            rooms: h.roomTypes.length,
            photos: h.photos.length,
            plan: h.plan,
            unpaidBill: insights[n]?.planBill.oldest ?? null,
            needsResponse: summary.byHostel[h.id] ?? 0,
          },
          today,
        );
        const tone = STEP_TONE[step.tone];
        return (
          <Card key={h.id}>
            <Pressable accessibilityRole="link" accessibilityLabel={`Manage ${h.name}`} onPress={() => router.push(`/owner/hostels/${h.id}`)} style={{ gap: theme.spacing.xs }}>
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
                {h.roomTypes.length} room types · {h.roomTypes.reduce((x, r) => x + r.bedsAvailable, 0)} beds free · from {rupees(minRent(h.roomTypes))}
                {h.ratings.rating !== null ? ` · ★ ${h.ratings.rating.toFixed(1)} (${h.ratings.reviewCount})` : ''}
              </P>
            </Pressable>
            <View
              accessible
              accessibilityLabel={`Next step: ${step.text}`}
              style={{ backgroundColor: tone.bg, borderColor: tone.border, borderWidth: 1, borderRadius: theme.radius.sm, padding: theme.spacing.md, gap: theme.spacing.sm }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 14 }}>{step.text}</Text>
            </View>
            {step.action && (
              <Button
                small
                variant={step.tone === 'ok' ? 'secondary' : 'primary'}
                title={step.action.label}
                onPress={() => router.push(sectionPath(h.id, step.action!.section))}
              />
            )}
          </Card>
        );
      })}

      <NavRow title="Visit requests" hint="Call or WhatsApp back quickly" onPress={() => router.push('/owner/visits')} />
      <NavRow
        title="All issues"
        hint="Everything your residents reported"
        badge={summary.needsResponse > 0 ? <Badge label={`${summary.needsResponse} waiting`} tone="red" /> : undefined}
        accessibilityHint={summary.needsResponse > 0 ? waitingLabel(summary.needsResponse) : undefined}
        onPress={() => router.push('/owner/issues')}
      />
      <NavRow title="Payouts" hint="Online rent and food, minus the platform fee" onPress={() => router.push('/owner/payouts')} />
      <NavRow title="Plans for owners" hint="Free, Pro and Partner" onPress={() => router.push('/owner/join')} />
    </Screen>
  );
}
