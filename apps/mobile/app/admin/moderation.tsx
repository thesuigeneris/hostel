import { timeAgo } from '@hostels/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, Empty, ErrorText, Field, H2, Notice, P, Row, Screen, Stars } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function AdminModerationScreen() {
  return (
    <RoleGate need="admin">
      <Stack.Screen options={{ title: 'Moderation' }} />
      <AdminModeration />
    </RoleGate>
  );
}

type Flagged = Awaited<ReturnType<typeof api.admin.flaggedReviews>>[number];

function AdminModeration() {
  const s = useLoad(async () => {
    const [flagged, reports] = await Promise.all([api.admin.flaggedReviews(), api.admin.reports()]);
    return { flagged, reports };
  });
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const { flagged, reports } = s.data!;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Hide reviews only when they break the rules: abuse, personal details, or clearly not about a stay. A bad rating alone is not a reason.</P>
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      <H2>Flagged reviews</H2>
      {flagged.length === 0 ? <Empty title="No flagged reviews" /> : flagged.map((f) => <FlaggedCard key={f.review.id} f={f} a={a} onDone={s.reload} />)}
      <H2>Reported community posts</H2>
      {reports.length === 0 ? <Empty title="No open reports" /> : reports.map((r) => (
        <Card key={r.id}>
          <P><Text style={{ fontWeight: '600' }}>{r.targetType}</Text> in {r.hostelName} · {timeAgo(r.createdAt)}: {r.reason}</P>
          <Button small variant="secondary" title="Open the board" onPress={() => router.push(`/owner/hostels/${r.hostelId}/community`)} />
        </Card>
      ))}
    </Screen>
  );
}

function FlaggedCard({ f, a, onDone }: { f: Flagged; a: ReturnType<typeof useAction>; onDone: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Card style={f.review.hidden ? { opacity: 0.7 } : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: theme.colors.text, flex: 1 }}>
          <Text style={{ fontWeight: '600' }}>{f.review.author}</Text> on <Text style={{ fontWeight: '600' }}>{f.hostelName}</Text> · {f.flags} flag{f.flags === 1 ? '' : 's'}
        </Text>
        <Stars value={f.review.rating} />
      </Row>
      {f.review.hidden && <Badge label="Hidden" tone="red" />}
      <P>{f.review.body}</P>
      {f.reasons.map((r, i) => <P key={`${i}-${r}`} muted>• {r}</P>)}
      {f.review.hidden ? (
        <Button small variant="secondary" title="Unhide" busy={a.busy === f.review.id} onPress={() => a.run(f.review.id, async () => { await api.admin.unhideReview(f.review.id); await onDone(); }, 'Review is visible again')} />
      ) : (
        <>
          <Field label="Reason" value={reason} onChangeText={setReason} maxLength={300} placeholder="Breaks review guidelines" />
          <Button
            small
            variant="danger"
            title="Hide review"
            busy={a.busy === f.review.id}
            onPress={() => a.run(f.review.id, async () => { await api.admin.hideReview(f.review.id, reason.trim() || 'Breaks review guidelines'); await onDone(); }, 'Review hidden')}
          />
        </>
      )}
    </Card>
  );
}
