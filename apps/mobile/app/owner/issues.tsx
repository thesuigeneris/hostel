import { Stack } from 'expo-router';
import { RoleGate } from '@/components/owner/Gate';
import { IssueCards } from '@/components/owner/IssueCard';
import { whileLoading } from '@/components/owner/parts';
import { ErrorText, H2, P, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { issuesByHostel } from '@/lib/owner';
import { useLoad } from '@/lib/useLoad';

export default function OwnerIssuesScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Issues' }} />
      <OwnerIssues />
    </RoleGate>
  );
}

function OwnerIssues() {
  const s = useLoad(async () => {
    const [issues, hostels] = await Promise.all([api.owner.issues(), api.owner.hostels()]);
    return issuesByHostel(issues, hostels);
  });
  const gate = whileLoading(s);
  if (gate) return gate;
  const groups = s.data!;
  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Everything your residents have reported, newest first. Response times show on your public listing.</P>
      <ErrorText>{s.error}</ErrorText>
      {groups.length === 0 && <IssueCards issues={[]} />}
      {groups.map((g) => (
        <IssueGroup key={g.hostelId} name={g.name} issues={g.issues} />
      ))}
    </Screen>
  );
}

function IssueGroup({ name, issues }: { name: string; issues: Parameters<typeof IssueCards>[0]['issues'] }) {
  return (
    <>
      <H2>{name}</H2>
      <IssueCards issues={issues} />
    </>
  );
}
