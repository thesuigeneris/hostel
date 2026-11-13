import { ApiError } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RoleGate } from '@/components/owner/Gate';
import { IssueCards } from '@/components/owner/IssueCard';
import { OwnerFeed } from '@/components/owner/OwnerFeed';
import { HostelHeader, Upsell, whileLoading } from '@/components/owner/parts';
import { Button, Card, ErrorText, H2, Notice, P, Screen, Segmented } from '@/components/ui';
import { api } from '@/lib/api';
import { splitIssues } from '@/lib/owner';
import { useAction } from '@/lib/ownerAction';
import { useLoad } from '@/lib/useLoad';

export default function CommunityScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Issues and community' }} />
      <Community />
    </RoleGate>
  );
}

function Community() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<'issues' | 'board'>('issues');
  const [showDone, setShowDone] = useState(false);
  const s = useLoad(async () => {
    const [h, issues, posts] = await Promise.all([
      api.owner.hostel(id),
      api.resident.issues(id),
      api.resident.feed(id).catch((e) => (e instanceof ApiError && e.code === 'plan_required' ? null : Promise.reject(e))),
    ]);
    return { h, issues, posts };
  }, [id]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const { h, issues, posts } = s.data!;
  const { open, done } = splitIssues(issues);

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'issues', label: `Issues (${open.length})` }, { value: 'board', label: 'Community board' }]} />
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      {tab === 'issues' ? (
        <>
          <P muted>
            {h.transparency
              ? `Public record: ${h.transparency.resolvedPct}% resolved, median first response ${h.transparency.medianHoursToFirstResponse ?? '—'} h over the last ${h.transparency.windowDays} days. Answering quickly improves it.`
              : 'Your response times appear on your listing once residents report a few issues. Acknowledge each one quickly.'}
          </P>
          <IssueCards issues={open} emptyText="No open issues" />
          {done.length > 0 && (
            <>
              <Button small variant="ghost" title={`${showDone ? 'Hide' : 'Show'} resolved and closed (${done.length})`} onPress={() => setShowDone(!showDone)} />
              {showDone && <IssueCards issues={done} />}
            </>
          )}
        </>
      ) : posts ? (
        <OwnerFeed hostelId={id} posts={posts} a={a} onChanged={s.reload} />
      ) : (
        <>
          <Card><H2>Community board</H2><P>Give residents a place to talk, and post announcements everyone sees.</P></Card>
          <Upsell hostelId={id} plan="pro" feature="The community board" suspended={h.plan.suspended} />
        </>
      )}
    </Screen>
  );
}
