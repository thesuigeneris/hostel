import { ApiError, type CommunityPost, ISSUE_CATEGORIES, type IssueCategory, type IssueView, type MyResidency, POST_KINDS, type PostKind, SHARING_LABEL, dateLabel, timeAgo, titleCase } from '@hostels/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Chip, Empty, ErrorText, Field, H2, Loading, Notice, P, Row, Screen, Segmented, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Tab = 'issues' | 'community' | 'neighbours' | 'review';
type Data = {
  stay: MyResidency;
  issues: IssueView[];
  posts: CommunityPost[] | null;
  people: { name: string; sharing: keyof typeof SHARING_LABEL | null; since: string }[];
};

const RATINGS = [['rating', 'Overall'], ['cleanliness', 'Cleanliness'], ['food', 'Food'], ['safety', 'Safety'], ['responsiveness', 'Owner response']] as const;

export default function HostelLife() {
  const { hostelId } = useLocalSearchParams<{ hostelId: string }>();
  const [tab, setTab] = useState<Tab>('issues');
  const { data, error, loading, refreshing, refresh, reload } = useLoad<Data | null>(async () => {
    const stays = await api.me.residencies();
    const stay = stays.find((s) => s.hostel.id === hostelId);
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
  // Issue form
  const [category, setCategory] = useState<IssueCategory>('maintenance');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Post form
  const [kind, setKind] = useState<PostKind>('general');
  const [body, setBody] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  // Review form
  const [scores, setScores] = useState<Record<string, number | null>>({ rating: 4, cleanliness: 4, food: null, safety: 4, responsiveness: 4 });
  const [review, setReview] = useState('');

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
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
  }

  if (loading) return <Loading />;
  if (!data) return <Screen><ErrorText>{error}</ErrorText><Empty title="You're not linked to this hostel" /></Screen>;
  const { stay, issues, posts, people } = data;

  if (stay.status === 'invited') {
    return (
      <Screen>
        <Stack.Screen options={{ title: stay.hostel.name }} />
        <Card tone="brand">
          <H2>{stay.hostel.name} added you as a resident</H2>
          <P>Since {dateLabel(stay.startDate)}. Accept to report issues, join the community, and review after two weeks.</P>
          <Row>
            <Button title="Accept" busy={busy === 'accept'} onPress={() => act('accept', () => api.me.acceptResidency(stay.id))} />
            <Button title="Not me" variant="ghost" busy={busy === 'decline'} onPress={() => act('decline', async () => { await api.me.declineResidency(stay.id); router.back(); })} />
          </Row>
        </Card>
        <ErrorText>{err}</ErrorText>
      </Screen>
    );
  }

  const active = stay.status === 'active';
  const tabs: { value: Tab; label: string }[] = active
    ? [{ value: 'issues', label: 'Issues' }, { value: 'community', label: 'Community' }, { value: 'neighbours', label: 'People' }, { value: 'review', label: 'Review' }]
    : [{ value: 'review', label: 'Review' }];
  const current = active ? tab : 'review';

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: stay.hostel.name }} />
      <Segmented value={current} onChange={setTab} options={tabs} />
      <ErrorText>{err}</ErrorText>
      <Notice>{msg}</Notice>

      {current === 'issues' && (
        <>
          <Card>
            <H2>Report an issue</H2>
            <P muted>The hostel sees it right away. How fast issues get fixed shows on the public listing.</P>
            <Row>{ISSUE_CATEGORIES.map((c) => <Chip key={c} label={titleCase(c)} active={c === category} onPress={() => setCategory(c)} />)}</Row>
            <Field label="What's wrong?" value={title} onChangeText={setTitle} placeholder="Geyser on 2nd floor not working" maxLength={120} />
            <Field label="Details" value={description} onChangeText={setDescription} multiline maxLength={2000} />
            <Button
              title="Report issue"
              busy={busy === 'issue'}
              disabled={title.trim().length < 4}
              onPress={() =>
                act('issue', async () => {
                  const issue = await api.resident.reportIssue(hostelId, { category, title, description });
                  setTitle('');
                  setDescription('');
                  router.push(`/issue/${issue.id}`);
                })
              }
            />
          </Card>
          {issues.length === 0 ? <Empty title="No issues reported. Nice." /> : issues.map((i) => (
            <Pressable key={i.id} onPress={() => router.push(`/issue/${i.id}`)}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '600', color: theme.colors.text, flex: 1 }}>{i.title}</Text>
                  <StatusBadge status={i.status} />
                </Row>
                <P muted>{titleCase(i.category)} · {i.reporter?.name ?? 'A resident'}{i.mine ? ' (you)' : ''} · {timeAgo(i.createdAt)} · {i.upvotes} me-too</P>
              </Card>
            </Pressable>
          ))}
        </>
      )}

      {current === 'community' && (posts === null ? (
        <Empty title="This hostel hasn't turned on the community board yet">You can still report issues.</Empty>
      ) : (
        <>
          <Card>
            <Field label="Post to your hostel" value={body} onChangeText={setBody} multiline maxLength={1000} placeholder="Ask your neighbours, share something, plan a movie night…" />
            <Row>{POST_KINDS.filter((k) => k !== 'announcement').map((k) => <Chip key={k} label={titleCase(k)} active={k === kind} onPress={() => setKind(k)} />)}</Row>
            <Button title="Post" busy={busy === 'post'} disabled={!body.trim()} onPress={() => act('post', async () => { await api.resident.post(hostelId, { kind, body }); setBody(''); })} />
          </Card>
          {posts.length === 0 && <Empty title="Nothing here yet">Start the conversation.</Empty>}
          {posts.map((p) => (
            <Card key={p.id}>
              <Row>
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>{p.author}</Text>
                <Badge label={titleCase(p.kind)} tone={p.kind === 'announcement' ? 'green' : p.kind === 'food' ? 'food' : 'gray'} />
                {p.pinned && <Badge label="Pinned" tone="green" />}
                <P muted>{timeAgo(p.createdAt)}</P>
              </Row>
              <P>{p.body}</P>
              {p.comments.map((c) => (
                <View key={c.id} style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: theme.spacing.sm }}>
                  <P><Text style={{ fontWeight: '600', color: theme.colors.text }}>{c.author}</Text> {c.body}</P>
                </View>
              ))}
              <Row style={{ flexWrap: 'nowrap' }}>
                <View style={{ flex: 1 }}>
                  <Field label="" placeholder="Reply" value={replies[p.id] ?? ''} onChangeText={(t) => setReplies((r) => ({ ...r, [p.id]: t }))} maxLength={500} />
                </View>
                <Button small variant="secondary" title="Reply" busy={busy === `c${p.id}`} disabled={!replies[p.id]?.trim()} onPress={() => act(`c${p.id}`, async () => { await api.resident.comment(p.id, replies[p.id]!); setReplies((r) => ({ ...r, [p.id]: '' })); })} />
              </Row>
              <Row>
                {p.mine ? (
                  <Button small variant="ghost" title="Delete" onPress={() => act(`d${p.id}`, () => api.resident.deletePost(p.id))} />
                ) : (
                  <Button small variant="ghost" title="Report" onPress={() => act(`r${p.id}`, () => api.resident.report('post', p.id, 'Reported from the app'), 'Reported. The hostel and our team will review it.')} />
                )}
              </Row>
            </Card>
          ))}
        </>
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
          <P muted>Your first name and the months you lived here show with the review.</P>
          {RATINGS.map(([key, label]) => (
            <View key={key} style={{ gap: 4 }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{label}</Text>
              <Row>
                {key === 'food' && <Chip label="Didn't eat here" active={scores.food === null} onPress={() => setScores((s) => ({ ...s, food: null }))} />}
                {[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={'★'.repeat(n)} active={scores[key] === n} onPress={() => setScores((s) => ({ ...s, [key]: n }))} />)}
              </Row>
            </View>
          ))}
          <Field label="Your review" value={review} onChangeText={setReview} multiline maxLength={2000} hint="At least 20 characters. Be fair and specific." />
          <Button
            title={stay.hasReview ? 'Update review' : 'Post review'}
            busy={busy === 'review'}
            disabled={review.trim().length < 20}
            onPress={() =>
              act('review', () => api.hostels.review(hostelId, {
                rating: scores.rating!, cleanliness: scores.cleanliness!, safety: scores.safety!, responsiveness: scores.responsiveness!, food: scores.food, body: review,
              }), 'Thanks! Your review is live.')
            }
          />
        </Card>
      ) : (
        <Empty title="You can review after two weeks here">Reviews come only from people who actually lived here, so they mean something.</Empty>
      ))}
    </Screen>
  );
}
