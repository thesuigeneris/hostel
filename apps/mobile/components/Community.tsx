import { type CommunityPost, ISSUE_CATEGORIES, type IssueCategory, type IssueView, POST_KINDS, type PostKind, timeAgo, titleCase } from '@hostels/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { theme } from '@/lib/theme';
import { type Photo, uploadPhoto } from '@/lib/upload';
import { PhotoField } from './PhotoField';
import { Badge, Button, Card, Chip, Empty, Field, H2, P, Row, StatusBadge } from './ui';

/** Runs an action for a screen: tracks which button is busy, shows errors and refreshes. Returns true on success. */
export type Act = (key: string, fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

const tiny = { color: theme.colors.muted, fontSize: 12, fontWeight: '600' as const };

function Link({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={[tiny, danger && { color: theme.colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function IssueList({ issues, emptyText = 'No issues reported. Nice.' }: { issues: IssueView[]; emptyText?: string }) {
  if (!issues.length) return <Empty title={emptyText} />;
  return (
    <>
      {issues.map((i) => (
        <Pressable key={i.id} accessibilityRole="link" accessibilityLabel={i.title} onPress={() => router.push(`/issue/${i.id}`)}>
          <Card>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text, flex: 1 }}>{i.title}</Text>
              <StatusBadge status={i.status} />
            </Row>
            {i.needsResponse && <Badge label="Waiting on hostel" tone="red" />}
            <P muted>{titleCase(i.category)} · {i.reporter?.name ?? 'A resident'}{i.mine ? ' (you)' : ''} · {timeAgo(i.createdAt)} · {i.upvotes} me-too</P>
          </Card>
        </Pressable>
      ))}
    </>
  );
}

export function IssueForm({ hostelId, act }: { hostelId: string; act: Act }) {
  const [category, setCategory] = useState<IssueCategory>('maintenance');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await act('issue', async () => {
      const photoUrl = photo ? await uploadPhoto(photo) : null;
      const issue = await api.resident.reportIssue(hostelId, { category, title, description, photoUrl });
      setTitle('');
      setDescription('');
      setPhoto(null);
      router.push(`/issue/${issue.id}`);
    }, 'Issue reported. The hostel has been notified.');
    setBusy(false);
  }

  return (
    <Card>
      <H2>Report an issue</H2>
      <P muted>The hostel sees it right away. How fast issues get fixed shows on the public listing.</P>
      <Row>{ISSUE_CATEGORIES.map((c) => <Chip key={c} label={titleCase(c)} active={c === category} onPress={() => setCategory(c)} />)}</Row>
      <Field label="What's wrong?" value={title} onChangeText={setTitle} placeholder="Geyser on 2nd floor not working" maxLength={120} />
      <Field label="Details" value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="Since when, which room, anything that helps" />
      <PhotoField value={photo} onChange={setPhoto} />
      <Button title="Report issue" busy={busy} disabled={title.trim().length < 4} onPress={submit} />
    </Card>
  );
}

/** The hostel's community board: post with an optional photo, reply, delete your own, report others. */
export function Feed({ hostelId, posts, act, busy }: { hostelId: string; posts: CommunityPost[]; act: Act; busy: string | null }) {
  const r = api.resident;
  const [kind, setKind] = useState<PostKind>('general');
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const reported = 'Reported. The hostel and our team will review it.';

  return (
    <>
      <Card>
        <Field label="Post to your hostel" value={body} onChangeText={setBody} multiline maxLength={1000} placeholder="Ask your neighbours, share something, plan a movie night…" />
        <Row>{POST_KINDS.filter((k) => k !== 'announcement').map((k) => <Chip key={k} label={titleCase(k)} active={k === kind} onPress={() => setKind(k)} />)}</Row>
        <PhotoField value={photo} onChange={setPhoto} />
        <Button
          title="Post"
          busy={busy === 'post'}
          disabled={!body.trim()}
          onPress={() =>
            act('post', async () => {
              const photoUrl = photo ? await uploadPhoto(photo) : null;
              await r.post(hostelId, { kind, body, photoUrl });
              setBody('');
              setPhoto(null);
            })
          }
        />
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
          {p.photoUrl ? <Image source={{ uri: p.photoUrl }} style={{ height: 220, borderRadius: theme.radius.sm, backgroundColor: theme.colors.brandSoft }} resizeMode="cover" accessibilityLabel="Attached to the post" /> : null}
          <Row style={{ gap: theme.spacing.lg }}>
            {p.mine ? (
              <Link label="Delete" danger onPress={() => confirm('Delete this post?', 'It is removed for everyone.', () => act(`d${p.id}`, () => r.deletePost(p.id)), 'Delete')} />
            ) : (
              <Link label="Report" onPress={() => act(`r${p.id}`, () => r.report('post', p.id, 'Reported from the app'), reported)} />
            )}
          </Row>
          {p.comments.map((c) => (
            <View key={c.id} style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: theme.spacing.sm, gap: 2 }}>
              <P><Text style={{ fontWeight: '600', color: theme.colors.text }}>{c.author}</Text> {c.body}</P>
              <Row style={{ gap: theme.spacing.lg }}>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{timeAgo(c.createdAt)}</Text>
                {c.mine ? (
                  <Link label="Delete" danger onPress={() => act(`dc${c.id}`, () => r.deleteComment(c.id))} />
                ) : (
                  <Link label="Report" onPress={() => act(`rc${c.id}`, () => r.report('comment', c.id, 'Reported from the app'), reported)} />
                )}
              </Row>
            </View>
          ))}
          <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field label="" accessibilityLabel="Reply" placeholder="Reply" value={replies[p.id] ?? ''} onChangeText={(t) => setReplies((x) => ({ ...x, [p.id]: t }))} maxLength={500} />
            </View>
            <Button
              small
              variant="secondary"
              title="Reply"
              busy={busy === `c${p.id}`}
              disabled={!replies[p.id]?.trim()}
              onPress={() => act(`c${p.id}`, async () => { await r.comment(p.id, replies[p.id]!); setReplies((x) => ({ ...x, [p.id]: '' })); })}
            />
          </Row>
        </Card>
      ))}
    </>
  );
}
