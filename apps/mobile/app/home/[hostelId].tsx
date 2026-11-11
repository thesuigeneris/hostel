import { ApiError, type CommunityPost, dateLabel, EDITED_AFTER_REPLY, type IssueView, type MyResidency, reviewEdits, SHARING_LABEL } from '@hostels/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { type Act, Feed, IssueForm, IssueList } from '@/components/Community';
import { Button, Card, Chip, Empty, ErrorState, ErrorText, Field, H2, Loading, Notice, P, Row, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { buildReview, charCount, type HomeTab, pickTab, type Scores, scoresFrom, tabsFor } from '@/lib/stay';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Data = {
  stay: MyResidency;
  issues: IssueView[];
  /** The board's posts, or why it is off (the API's words: never turned on, or paused with nothing lost). */
  board: { posts: CommunityPost[] } | { off: string };
  people: { name: string; sharing: keyof typeof SHARING_LABEL | null; since: string }[];
};

const RATINGS = [['rating', 'Overall'], ['cleanliness', 'Cleanliness'], ['food', 'Food'], ['safety', 'Safety'], ['responsiveness', 'Owner response']] as const;
const TAB_LABEL: Record<HomeTab, string> = { community: 'Community', issues: 'Issues', neighbours: 'People', review: 'Review' };

export default function HostelLife() {
  const { hostelId, tab: askedTab } = useLocalSearchParams<{ hostelId: string; tab?: string }>();
  const [tab, setTab] = useState<HomeTab | null>(null);
  const { data, error, loading, refreshing, refresh, reload } = useLoad<Data | null>(async () => {
    const stays = await api.me.residencies();
    // An invite or a current stay comes first; otherwise the latest past stay, for its issues and review.
    const stay = stays.find((s) => s.hostel.id === hostelId && (s.status === 'active' || s.status === 'invited')) ?? stays.find((s) => s.hostel.id === hostelId && s.status === 'ended');
    if (!stay) return null;
    if (stay.status === 'invited') return { stay, issues: [], board: { off: '' }, people: [] };
    if (stay.status !== 'active') {
      // Moved out: the issues you reported stay readable, read-only.
      const mine = (await api.resident.myIssues()).filter((i) => i.hostelId === hostelId);
      return { stay, issues: mine, board: { off: '' }, people: [] };
    }
    const [issues, board, people] = await Promise.all([
      api.resident.issues(hostelId),
      api.resident
        .feed(hostelId)
        .then((posts) => ({ posts }))
        .catch((e) => (e instanceof ApiError && e.code === 'plan_required' ? { off: e.message } : Promise.reject(e))),
      api.resident.directory(hostelId),
    ]);
    return { stay, issues, board, people };
  }, [hostelId]);

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [review, setReview] = useState<string | null>(null);
  // The review form starts from the review you already wrote, if any.
  useEffect(() => {
    if (data?.stay.review && scores === null) {
      setScores(scoresFrom(data.stay.review));
      setReview(data.stay.review.body);
    }
  }, [data?.stay.review, scores]);

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
      await reload();
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
  const { stay, issues, board, people } = data;

  if (stay.status === 'invited') {
    return (
      <Screen>
        <Stack.Screen options={{ title: stay.hostel.name }} />
        <Card tone="brand">
          <H2>{stay.hostel.name} added you as a resident</H2>
          <P>Since {dateLabel(stay.startDate)}. Accept to report issues, join the community, and review after two weeks.</P>
          <Row>
            <Button title="Accept" label={`Accept: join ${stay.hostel.name}`} busy={busy === 'accept'} disabled={!!busy} onPress={() => act('accept', () => api.me.acceptResidency(stay.id), 'Welcome! You can now see your hostel community.')} />
            <Button
              title="Not me"
              variant="ghost"
              label={`Not me: decline the invite from ${stay.hostel.name}`}
              busy={busy === 'decline'}
              disabled={!!busy}
              onPress={() =>
                confirm(`Decline the invite from ${stay.hostel.name}?`, 'They would have to add you again.', () => act('decline', async () => { await api.me.declineResidency(stay.id); router.back(); }), 'Decline')
              }
            />
          </Row>
        </Card>
        <ErrorText>{err}</ErrorText>
      </Screen>
    );
  }

  const active = stay.status === 'active';
  const current = tab ?? pickTab(askedTab, active);
  const form = scores ?? scoresFrom(stay.review);
  const body = review ?? stay.review?.body ?? '';
  const edits = stay.review ? reviewEdits(stay.review) : null;
  const sendReview = () => {
    const built = buildReview(form, body);
    if (!built.ok) return setErr(built.error);
    act('review', () => api.hostels.review(hostelId, built.input), 'Thanks! Your review is live.');
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: stay.hostel.name }} />
      <Row>
        <P muted>{stay.hostel.area} · {active ? `living here since ${dateLabel(stay.startDate)}` : `lived here ${dateLabel(stay.startDate)} – ${dateLabel(stay.endDate)}`}</P>
        <Pressable accessibilityRole="link" hitSlop={12} onPress={() => router.push(`/hostel/${stay.hostel.slug}`)}>
          <Text style={{ color: theme.colors.brand, fontSize: 13, textDecorationLine: 'underline' }}>Public page</Text>
        </Pressable>
      </Row>
      <Segmented value={current} onChange={setTab} options={tabsFor(active).map((t) => ({ value: t, label: TAB_LABEL[t] }))} />
      <ErrorText>{err}</ErrorText>
      <Notice>{msg}</Notice>

      {current === 'issues' &&
        (active ? (
          <>
            <IssueForm hostelId={hostelId} act={act} />
            <H2>Issues at {stay.hostel.name}</H2>
            <IssueList issues={issues} />
            <P muted>Other residents see issues without your name. Add a me-too on ones that affect you too.</P>
          </>
        ) : (
          <>
            <H2>Issues you reported here</H2>
            <P muted>You've moved out, so these are read-only. They stay on the hostel's record, and the hostel can still fix them.</P>
            <IssueList issues={issues} emptyText="You didn't report any issues here." />
          </>
        ))}

      {current === 'community' &&
        ('posts' in board ? <Feed hostelId={hostelId} posts={board.posts} act={act} busy={busy} /> : <Empty title="The community board is off">{board.off}</Empty>)}

      {current === 'neighbours' && (
        <>
          <Card>
            <P>
              {stay.directoryOptIn
                ? 'Neighbours can see your first name, last initial and room type. Never your phone number.'
                : 'You are hidden from the neighbour list. If you show yourself, neighbours see your first name, last initial and room type, never your phone number.'}
            </P>
            <Button small variant="secondary" title={stay.directoryOptIn ? 'Hide me' : 'Show me'} busy={busy === 'dir'} onPress={() => act('dir', () => api.me.setDirectory(stay.id, !stay.directoryOptIn))} />
          </Card>
          {people.length === 0 ? (
            <Empty title="No one has joined the list yet">Neighbours who choose to show themselves appear here.</Empty>
          ) : (
            people.map((p) => (
              <Card key={`${p.name}-${p.since}`}>
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>{p.name}</Text>
                <P muted>{p.sharing ? SHARING_LABEL[p.sharing] : 'Resident'} · since {dateLabel(p.since)}</P>
              </Card>
            ))
          )}
        </>
      )}

      {current === 'review' &&
        (stay.canReview ? (
          <Card>
            <H2>{stay.review ? 'Update your review' : 'Review your stay'}</H2>
            <P muted>Your first name, last initial and the months you lived here show with the review. Be fair and specific.</P>
            {stay.review?.hidden && (
              <Card tone="danger">
                <P>
                  Our team hid this review{stay.review.hiddenReason ? ` (${stay.review.hiddenReason})` : ''}. It does not show on the hostel page or count toward its
                  rating, and editing it doesn't change that.
                </P>
              </Card>
            )}
            {stay.review?.ownerReply && (
              <View style={{ backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm, padding: theme.spacing.md, gap: 4 }}>
                <P>
                  <Text style={{ fontWeight: '600', color: theme.colors.text }}>The hostel replied{stay.review.ownerRepliedAt ? ` on ${dateLabel(stay.review.ownerRepliedAt)}` : ''}:</Text>{' '}
                  {stay.review.ownerReply}
                </P>
                <P muted>
                  {edits?.editedAfterReply
                    ? `You edited your review after this reply, so readers see “${EDITED_AFTER_REPLY}” next to it.`
                    : `If you edit your review now, readers see “${EDITED_AFTER_REPLY}” next to the reply.`}
                </P>
              </View>
            )}
            {RATINGS.filter(([key]) => key !== 'food' || stay.hostel.foodAvailable).map(([key, label]) => (
              <View key={key} style={{ gap: 4 }}>
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>{label}</Text>
                <Row>
                  {key === 'food' && <Chip label="Didn't eat here" active={form.food === null} onPress={() => setScores({ ...form, food: null })} />}
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Chip key={n} label={'★'.repeat(n)} active={form[key] === n} onPress={() => setScores({ ...form, [key]: n })} />
                  ))}
                </Row>
              </View>
            ))}
            <Field
              label="Your review"
              value={body}
              onChangeText={setReview}
              multiline
              maxLength={4000}
              placeholder="What was it like to live here?"
              hint={`20 to 2,000 characters. Be fair and specific. ${charCount(body, 2000)}`}
            />
            <Button title={stay.review ? 'Update review' : 'Post review'} busy={busy === 'review'} disabled={!!busy} onPress={sendReview} />
            {stay.review && (
              <P muted>Posted {dateLabel(stay.review.createdAt)}{edits?.edited ? `, last edited ${dateLabel(stay.review.updatedAt)}` : ''}</P>
            )}
          </Card>
        ) : (
          <Empty title={stay.review ? 'Reviews for this stay are closed' : 'You cannot review this stay yet'}>
            {stay.reviewBlockedReason ?? 'Only residents can review this hostel'}. Reviews come only from verified residents, so they mean something.
          </Empty>
        ))}
    </Screen>
  );
}
