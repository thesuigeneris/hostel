import { dateLabel, type IssueDetail, type IssueStatus, timeAgo, titleCase } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Text } from 'react-native';
import { Badge, Button, Card, ErrorState, ErrorText, Field, H1, H2, Loading, Notice, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { issueMoves } from '@/lib/stay';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function IssueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data, error, loading, refreshing, refresh, reload, setData } = useLoad(async () => {
    const issue = await api.resident.issue(id);
    // The hostel's owner (or an admin) moves the status forward; residents only confirm or reopen.
    const owns = user && user.role !== 'tenant' ? user.role === 'admin' || (await api.owner.hostels().catch(() => [])).some((h) => h.id === issue.hostelId) : false;
    return { issue, owns };
  }, [id, user?.id]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!data) return <Screen onRefresh={refresh} refreshing={refreshing}><ErrorState message={error} onRetry={reload} /></Screen>;
  const { issue, owns } = data;

  async function act(key: string, fn: () => Promise<IssueDetail>, done?: string) {
    setBusy(key);
    setErr(null);
    setOk(null);
    try {
      const next = await fn();
      setData({ issue: next, owns });
      setMessage('');
      if (done) setOk(done);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  const update = (status?: IssueStatus) =>
    act(status ?? 'comment', () => api.resident.updateIssue(id, { status, message: message.trim() || undefined }), status ? `Marked ${status.replace('_', ' ')}` : undefined);
  const moves = issueMoves(issue, owns);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: titleCase(issue.category) }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <StatusBadge status={issue.status} />
        {issue.needsResponse && <Badge label="Waiting on the hostel" tone="red" />}
      </Row>
      <H1>{issue.title}</H1>
      <P muted>{titleCase(issue.category)} · reported by {issue.reporter?.name ?? 'a resident'}{issue.mine ? ' (you)' : ''} on {dateLabel(issue.createdAt)}</P>
      {issue.description ? <P>{issue.description}</P> : null}
      {issue.photoUrl ? <Image source={{ uri: issue.photoUrl }} style={{ height: 240, borderRadius: theme.radius.md, backgroundColor: theme.colors.brandSoft }} resizeMode="cover" accessibilityLabel={issue.title} /> : null}
      <Row>
        <P>{issue.upvotes} {issue.upvotes === 1 ? 'person has' : 'people have'} this too</P>
        {!issue.mine && !owns && issue.status !== 'closed' && (
          <Button small variant="secondary" title={issue.upvotedByMe ? 'Remove me-too' : 'Me too'} busy={busy === 'vote'} onPress={() => act('vote', () => api.resident.upvote(id, !issue.upvotedByMe))} />
        )}
      </Row>
      {issue.mine && issue.status === 'resolved' && (
        <Card tone="brand">
          <P>The hostel marked this fixed. Is it? If you don't answer within 7 days it closes on its own.</P>
        </Card>
      )}
      <ErrorText>{err}</ErrorText>
      <Notice>{ok}</Notice>

      <H2>Updates</H2>
      {issue.updates.length === 0 && <P muted>No updates yet.</P>}
      {issue.updates.map((u) => (
        <Card key={u.id}>
          <Row>
            <Text style={{ fontWeight: '600', color: theme.colors.text }}>{u.author}</Text>
            {u.byOwner && <Badge label="Hostel" tone="green" />}
            {u.toStatus && <><P muted>moved it to</P><StatusBadge status={u.toStatus} /></>}
            <P muted>{timeAgo(u.createdAt)}</P>
          </Row>
          {u.message ? <P>{u.message}</P> : null}
        </Card>
      ))}

      {issue.status !== 'closed' ? (
        <Card>
          <Field label={owns ? 'Update for residents' : 'Add a comment'} value={message} onChangeText={setMessage} multiline maxLength={1000} placeholder={owns ? 'Tell residents what you are doing about it' : 'Add a comment'} />
          <Row>
            <Button small title="Comment" variant="secondary" busy={busy === 'comment'} disabled={!message.trim()} onPress={() => update()} />
            {moves.map((m) => (
              <Button key={m.status} small title={m.label} variant={m.primary ? 'primary' : 'ghost'} busy={busy === m.status} onPress={() => update(m.status)} />
            ))}
          </Row>
        </Card>
      ) : (
        <P muted>This issue is closed{issue.closedAt ? ` since ${dateLabel(issue.closedAt)}` : ''}.</P>
      )}
    </Screen>
  );
}
