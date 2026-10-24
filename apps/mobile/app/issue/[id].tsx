import { dateLabel, type IssueStatus, timeAgo, titleCase } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Text } from 'react-native';
import { Badge, Button, Card, ErrorText, Field, H1, Loading, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function IssueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: issue, error, loading, refreshing, refresh, setData } = useLoad(() => api.resident.issue(id), [id]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!issue) return <Screen><ErrorText>{error}</ErrorText></Screen>;

  async function act(key: string, fn: () => ReturnType<typeof api.resident.issue>) {
    setBusy(key);
    setErr(null);
    try {
      setData(await fn());
      setMessage('');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  const update = (status?: IssueStatus) => act(status ?? 'comment', () => api.resident.updateIssue(id, { status, message: message.trim() || undefined }));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: titleCase(issue.category) }} />
      <Row style={{ justifyContent: 'space-between' }}><StatusBadge status={issue.status} />{issue.needsResponse && <Badge label="Waiting on the hostel" tone="red" />}</Row>
      <H1>{issue.title}</H1>
      <P muted>Reported by {issue.reporter?.name ?? 'a resident'} on {dateLabel(issue.createdAt)}</P>
      {issue.description ? <P>{issue.description}</P> : null}
      {issue.photoUrl ? <Image source={{ uri: issue.photoUrl }} style={{ height: 220, borderRadius: theme.radius.md }} accessibilityLabel={issue.title} /> : null}
      <Row>
        <P>{issue.upvotes} {issue.upvotes === 1 ? 'person has' : 'people have'} this too</P>
        {!issue.mine && issue.status !== 'closed' && (
          <Button small variant="secondary" title={issue.upvotedByMe ? 'Remove me-too' : 'Me too'} busy={busy === 'vote'} onPress={() => act('vote', () => api.resident.upvote(id, !issue.upvotedByMe))} />
        )}
      </Row>
      {issue.mine && issue.status === 'resolved' && (
        <Card tone="brand">
          <P>The hostel marked this fixed. Is it?</P>
          <Row>
            <Button small title="Yes, fixed" busy={busy === 'closed'} onPress={() => update('closed')} />
            <Button small variant="secondary" title="Still broken" busy={busy === 'open'} onPress={() => update('open')} />
          </Row>
        </Card>
      )}
      {issue.updates.map((u) => (
        <Card key={u.id}>
          <Row>
            <Text style={{ fontWeight: '600', color: theme.colors.text }}>{u.author}</Text>
            {u.byOwner && <Badge label="Hostel" tone="green" />}
            {u.toStatus && <StatusBadge status={u.toStatus} />}
            <P muted>{timeAgo(u.createdAt)}</P>
          </Row>
          {u.message ? <P>{u.message}</P> : null}
        </Card>
      ))}
      {issue.status !== 'closed' && (
        <>
          <Field label="Add a comment" value={message} onChangeText={setMessage} multiline maxLength={1000} />
          <ErrorText>{err}</ErrorText>
          <Button title="Comment" variant="secondary" busy={busy === 'comment'} disabled={!message.trim()} onPress={() => update()} />
        </>
      )}
    </Screen>
  );
}
