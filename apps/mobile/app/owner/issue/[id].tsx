import { dateLabel, timeAgo, titleCase } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, ErrorText, Field, H1, H2, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { MOVE_LABEL, OWNER_NEXT } from '@/lib/owner';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function OwnerIssueScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Issue' }} />
      <OwnerIssue />
    </RoleGate>
  );
}

/** The owner's side of an issue: move it forward (acknowledge, start work, resolve) with an optional note. */
function OwnerIssue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useLoad(() => api.resident.issue(id), [id]);
  const a = useAction();
  const [message, setMessage] = useState('');
  const gate = whileLoading(s);
  if (gate) return gate;
  const issue = s.data!;
  const moves = OWNER_NEXT[issue.status];

  const send = (status?: (typeof moves)[number]) =>
    a.run(status ?? 'comment', async () => {
      s.setData(await api.resident.updateIssue(id, { status, message: message.trim() || undefined }));
      setMessage('');
    }, status ? `Moved to ${status.replace(/_/g, ' ')}` : 'Comment added');

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <Stack.Screen options={{ title: titleCase(issue.category) }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <StatusBadge status={issue.status} />
        {issue.needsResponse && <Badge label="Waiting on you" tone="red" />}
      </Row>
      <H1>{issue.title}</H1>
      <P muted>{titleCase(issue.category)} · reported by {issue.reporter?.name ?? 'a resident'} on {dateLabel(issue.createdAt)} · {issue.upvotes} me-too</P>
      {issue.description ? <P>{issue.description}</P> : null}
      {issue.photoUrl ? <Image source={{ uri: issue.photoUrl }} style={{ height: 220, borderRadius: theme.radius.md }} accessibilityLabel={issue.title} /> : null}

      {issue.status !== 'closed' && (
        <Card>
          <Field label={moves.length ? 'Note to the resident (optional)' : 'Add a comment'} value={message} onChangeText={setMessage} multiline maxLength={1000} placeholder="Plumber is coming at 4 pm" />
          <ErrorText>{a.error}</ErrorText>
          <Row>
            {moves.map((m) => <Button key={m} small title={MOVE_LABEL[m]} variant={m === 'resolved' ? 'primary' : 'secondary'} busy={a.busy === m} onPress={() => send(m)} />)}
            <Button small variant="ghost" title="Comment only" disabled={!message.trim()} busy={a.busy === 'comment'} onPress={() => send()} />
          </Row>
          {issue.status === 'resolved' && <P muted>Waiting for the resident to confirm. It closes on its own after 7 days.</P>}
        </Card>
      )}

      <H2>Updates</H2>
      {issue.updates.length === 0 ? <P muted>No updates yet.</P> : issue.updates.map((u) => (
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
    </Screen>
  );
}
