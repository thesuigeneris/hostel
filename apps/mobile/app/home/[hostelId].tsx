import { ApiError, type CommunityPost, dateLabel, type IssueView, type MyResidency, SHARING_LABEL } from '@hostels/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { type Act, Feed, IssueForm, IssueList } from '@/components/Community';
import { Button, Card, Chip, Empty, ErrorState, ErrorText, Field, H2, Loading, Notice, P, Row, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { buildReview, DEFAULT_SCORES, type HomeTab, pickTab, type Scores } from '@/lib/stay';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Data = {
  stay: MyResidency;
  issues: IssueView[];
  posts: CommunityPost[] | null;
  people: { name: string; sharing: keyof typeof SHARING_LABEL | null; since: string }[];
};

const RATINGS = [['rating', 'Overall'], ['cleanliness', 'Cleanliness'], ['food', 'Food'], ['safety', 'Safety'], ['responsiveness', 'Owner response']] as const;
const TABS: { value: HomeTab; label: string }[] = [
  { value: 'community', label: 'Community' },
  { value: 'issues', label: 'Issues' },
  { value: 'neighbours', label: 'People' },
  { value: 'review', label: 'Review' },
];

export default function HostelLife() {
  const { hostelId, tab: askedTab } = useLocalSearchParams<{ hostelId: string; tab?: string }>();
  const [tab, setTab] = useState<HomeTab | null>(null);
  const { data, error, loading, refreshing, refresh, reload } = useLoad<Data | null>(async () => {
    const stays = await api.me.residencies();
    // An invite or a current stay comes first; otherwise the latest past stay, for its review.
    const stay = stays.find((s) => s.hostel.id === hostelId && (s.status === 'active' || s.status === 'invited')) ?? stays.find((s) => s.hostel.id === hostelId && s.status === 'ended');
    if (!stay) return null;
    if (stay.status !== 'active') return { stay, issues: [], posts: null, people: [] };
    const [issues, posts, people] = await Promise.all([
      api.resident.issues(hostelId),
      api.resident.feed(hostelId).catch((e) => (e instanceof ApiError && e.code === 'plan_required' ? null : Promise.reject(e))),
      api.resident.directory(hostelId),
    ]);
    return { stay, issues, posts, people };
  }, [hostelId]);

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [scores, setScores] = useState<Scores>(DEFAULT_SCORES);
  const [review, setReview] = useState('');

  const act: Act = async (key, fn, done) => {
    setBusy(key);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      if (done) setMsg(done);
      await reload();
      return true;
    } catch (e) {
      setErr(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;
  if (error && !data) return <Screen onRefresh={refresh} refreshing={refreshing}><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) {
    return (
      <Screen>
        <Empty title="You're not linked to this hostel">Ask your hostel owner to add your phone number, or subscribe to a verified hostel.</Empty>
        <Button variant="secondary" title="Back to My Stay" onPress={() => router.replace('/stay')} />
      </Screen>
    );
  }
  const { stay, issues, posts, people } = data;

  if (stay.status === 'invited') {
    return (
      <Screen>
        <Stack.Screen options={{ title: stay.hostel.name }} />
        <Card tone="brand">
          <H2>{stay.hostel.name} added you as a resident</H2>
          <P>Since {dateLabel(stay.startDate)}. Accept to report issues, join the community, and review after two weeks.</P>
          <Row>
            <Button title="Accept" busy={busy === 'accept'} onPress={() => act('accept', () => api.me.acceptResidency(stay.id), 'Welcome! You can now see your hostel community.')} />
            <Button title="Not me" variant="ghost" busy={busy === 'decline'} onPress={() => act('decline', async () => { await api.me.declineResidency(stay.id); router.back(); })} />
          </Row>
        </Card>
        <ErrorText>{err}</ErrorText>
      </Screen>
    );
  }

  const active = stay.status === 'active';
  const current = tab ?? pickTab(askedTab, active);
  const sendReview = () => {
    const built = buildReview(scores, review);
    if (!built.ok) return setErr(built.error);
    act('review', () => api.hostels.review(hostelId, built.input), 'Thanks! Your review is live.');
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: stay.hostel.name }} />
      <Row>
        <P muted>{stay.hostel.area} · {active ? `living here since ${dateLabel(stay.startDate)}` : `lived here until ${dateLabel(stay.endDate)}`}</P>
        <Pressable accessibilityRole="link" onPress={() => router.push(`/hostel/${stay.hostel.slug}`)}>
          <Text style={{ color: theme.colors.brand, fontSize: 13, textDecorationLine: 'underline' }}>Public page</Text>
        </Pressable>
      </Row>
      {active && <Segmented value={current} onChange={setTab} options={TABS} />}
      <ErrorText>{err}</ErrorText>
      <Notice>{msg}</Notice>

      {current === 'issues' && (
        <>
          <IssueForm hostelId={hostelId} act={act} />
          <H2>Issues at {stay.hostel.name}</H2>
          <IssueList issues={issues} />
        </>
      )}

      {current === 'community' && (posts === null ? (
        <Empty title="This hostel hasn't turned on the community board yet">You can still report issues.</Empty>
      ) : (
        <Feed hostelId={hostelId} posts={posts} act={act} busy={busy} />
      ))}

      {current === 'neighbours' && (
        <>
          <Card>
            <P>{stay.directoryOptIn ? 'Neighbours can see your first name and room type.' : 'You are hidden from the neighbour list.'}</P>
            <Button small variant="secondary" title={stay.directoryOptIn ? 'Hide me' : 'Show me'} busy={busy === 'dir'} onPress={() => act('dir', () => api.me.setDirectory(stay.id, !stay.directoryOptIn))} />
          </Card>
          {people.length === 0 ? <Empty title="No one has joined the list yet" /> : people.map((p) => (
            <Card key={`${p.name}-${p.since}`}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{p.name}</Text>
              <P muted>{p.sharing ? SHARING_LABEL[p.sharing] : 'Resident'} · since {dateLabel(p.since)}</P>
            </Card>
          ))}
        </>
      )}

      {current === 'review' && (stay.canReview ? (
        <Card>
          <H2>{stay.hasReview ? 'Update your review' : 'Review your stay'}</H2>
          <P muted>Your first name and the months you lived here show with the review. {stay.hasReview ? 'Posting again replaces your earlier review.' : ''}</P>
          {RATINGS.map(([key, label]) => (
            <View key={key} style={{ gap: 4 }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{label}</Text>
              <Row>
                {key === 'food' && <Chip label="Didn't eat here" active={scores.food === null} onPress={() => setScores((s) => ({ ...s, food: null }))} />}
                {[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={'★'.repeat(n)} active={scores[key] === n} onPress={() => setScores((s) => ({ ...s, [key]: n }))} />)}
              </Row>
            </View>
          ))}
          <Field label="Your review" value={review} onChangeText={setReview} multiline maxLength={2000} placeholder="What was it like to live here?" hint={`At least 20 characters. Be fair and specific. ${review.trim().length}/2000`} />
          <Button title={stay.hasReview ? 'Update review' : 'Post review'} busy={busy === 'review'} disabled={review.trim().length < 20} onPress={sendReview} />
        </Card>
      ) : stay.hasReview ? (
        <Empty title="Thanks for your review">It shows on the hostel's public page.</Empty>
      ) : (
        <Empty title="You can review after two weeks here">Reviews come only from people who actually lived here, so they mean something.</Empty>
      ))}
    </Screen>
  );
}
