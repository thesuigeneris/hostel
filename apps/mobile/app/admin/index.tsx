import { router, Stack } from 'expo-router';
import { RoleGate } from '@/components/owner/Gate';
import { NavRow, Stat, StatGrid, whileLoading } from '@/components/owner/parts';
import { Button, Card, ErrorText, H2, Notice, P, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/ownerAction';
import { useLoad } from '@/lib/useLoad';

export default function AdminHomeScreen() {
  return (
    <RoleGate need="admin">
      <Stack.Screen options={{ title: 'Admin' }} />
      <AdminHome />
    </RoleGate>
  );
}

function AdminHome() {
  const s = useLoad(() => api.admin.stats());
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const st = s.data!;
  const go = (path: string) => () => router.push(path as never);

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>What needs attention today.</P>
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      <StatGrid>
        <Stat label="Listings to review" value={st.listingsPending} onPress={go('/admin/listings')} />
        <Stat label="Partner applications" value={st.partnersApplied} onPress={go('/admin/partners')} />
        <Stat label="Flagged reviews" value={st.flaggedReviews} onPress={go('/admin/moderation')} />
        <Stat label="Reported posts" value={st.openReports} onPress={go('/admin/moderation')} />
        <Stat label="Live hostels" value={st.liveHostels} />
        <Stat label="Active subscriptions" value={st.activeSubscriptions} />
        <Stat label="Overdue bills" value={st.overdueBills} onPress={go('/admin/billing')} />
      </StatGrid>

      <NavRow title="Listings" hint="Approve or send back new listings" onPress={go('/admin/listings')} />
      <NavRow title="Partners" hint="Verify partner hostels, set fees" onPress={go('/admin/partners')} />
      <NavRow title="Subscriptions and bills" hint="Overdue bills, moves, owner plan bills" onPress={go('/admin/billing')} />
      <NavRow title="Payouts" hint="Generate and mark payouts paid" onPress={go('/admin/payouts')} />
      <NavRow title="Moderation" hint="Flagged reviews and reported posts" onPress={go('/admin/moderation')} />
      <NavRow title="Food partners" hint="Cloud kitchens for partner menus" onPress={go('/admin/food')} />

      <Card>
        <H2>Scheduled jobs</H2>
        <P muted>Bills, plan changes, expiring holds, moves and issue auto-close run every 15 minutes. Run them now to see changes right away. Running twice is safe.</P>
        <Button
          title="Run jobs now"
          variant="secondary"
          busy={a.busy === 'jobs'}
          onPress={async () => {
            const res = await a.run('jobs', () => api.admin.runJobs());
            if (res) {
              a.setOk(`Jobs ran. ${Object.entries(res).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
              s.reload();
            }
          }}
        />
      </Card>
    </Screen>
  );
}
