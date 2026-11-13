import { type AdminFlaggedReview, type AdminReport, HIDE_REASONS, moderationReason, timeAgo } from '@hostels/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, Chip, Empty, ErrorText, Field, H2, Notice, P, Row, Screen, Stars } from '@/components/ui';
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

type Action = ReturnType<typeof useAction>;

function AdminModeration() {
  const s = useLoad(async () => {
    const [flagged, hidden, reports, hiddenContent] = await Promise.all([
      api.admin.flaggedReviews(),
      api.admin.hiddenReviews(),
      api.admin.reports(),
      api.admin.hiddenContent(),
    ]);
    return { flagged, hidden, reports, hiddenContent };
  });
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const { flagged, hidden, reports, hiddenContent } = s.data!;
  const done = () => s.reload();

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Hide only what breaks the rules: abuse, personal details, or not about a stay. A bad rating alone is not a reason. Every decision is logged with its reason.</P>
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>

      <H2>Flagged reviews ({flagged.length})</H2>
      {flagged.length === 0 ? <Empty title="No flagged reviews">Reviews readers report land here.</Empty> : flagged.map((f) => <FlaggedCard key={f.review.id} f={f} a={a} onDone={done} />)}

      <H2>Reported posts and comments ({reports.length})</H2>
      {reports.length === 0 ? <Empty title="No open reports">Posts and comments residents report land here.</Empty> : reports.map((r) => <ReportCard key={`${r.targetType}-${r.targetId}`} r={r} a={a} onDone={done} />)}

      <H2>Hidden reviews</H2>
      {hidden.length === 0 ? <P muted>None.</P> : hidden.map((h) => (
        <Card key={h.review.id}>
          <P><Text style={{ fontWeight: '600' }}>{h.review.author}</Text> on {h.hostelName} · {h.review.hiddenReason ?? 'no reason recorded'}</P>
          <P muted numberOfLines={3}>{h.review.body}</P>
          <Button small variant="secondary" title="Show again" busy={a.busy === h.review.id} onPress={() => a.run(h.review.id, async () => { await api.admin.unhideReview(h.review.id); await done(); }, 'Review is visible again')} />
        </Card>
      ))}

      <H2>Hidden posts and comments</H2>
      {hiddenContent.length === 0 ? <P muted>None.</P> : hiddenContent.map((h) => (
        <Card key={`${h.targetType}-${h.targetId}`}>
          <P>{h.targetType === 'post' ? 'Post' : 'Comment'} by {h.author} in {h.hostelName}</P>
          <P muted numberOfLines={3}>{h.body}</P>
          <Button small variant="secondary" title="Show again" busy={a.busy === h.targetId} onPress={() => a.run(h.targetId, async () => { await api.admin.moderateContent(h.targetType, h.targetId, 'unhide'); await done(); }, 'Visible again')} />
        </Card>
      ))}
    </Screen>
  );
}

/** Pick one of the rules (and add a note) before hiding or keeping. */
function Reason({ choice, setChoice, note, setNote }: { choice: string; setChoice: (v: string) => void; note: string; setNote: (v: string) => void }) {
  return (
    <>
      <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Reason</Text>
      <Row>{HIDE_REASONS.map((r) => <Chip key={r} label={r} active={choice === r} onPress={() => setChoice(choice === r ? '' : r)} />)}</Row>
      <Field label="Note" hint="Optional when a reason is picked; needed to keep." value={note} onChangeText={setNote} maxLength={200} />
    </>
  );
}

function FlaggedCard({ f, a, onDone }: { f: AdminFlaggedReview; a: Action; onDone: () => void }) {
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const hideReason = moderationReason(choice, note);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: theme.colors.text, flex: 1 }}>
          <Text style={{ fontWeight: '600' }}>{f.review.author}</Text> on <Text style={{ fontWeight: '600' }}>{f.hostelName}</Text> · {f.flags} flag{f.flags === 1 ? '' : 's'}
        </Text>
        <Stars value={f.review.rating} />
      </Row>
      {f.review.hidden && <Badge label="Hidden" tone="red" />}
      <P>{f.review.body}</P>
      {f.reasons.map((r, i) => <P key={`${i}-${r}`} muted>• {r}</P>)}
      <P muted>First flagged {timeAgo(f.firstFlaggedAt)}</P>
      <Reason choice={choice} setChoice={setChoice} note={note} setNote={setNote} />
      <Row>
        <Button
          small
          variant="danger"
          title="Hide review"
          disabled={hideReason.length < 3}
          busy={a.busy === `h-${f.review.id}`}
          onPress={() => a.run(`h-${f.review.id}`, async () => { await api.admin.hideReview(f.review.id, hideReason); await onDone(); }, 'Review hidden')}
        />
        <Button
          small
          variant="secondary"
          title="Keep it"
          disabled={note.trim().length < 3}
          busy={a.busy === `k-${f.review.id}`}
          onPress={() => a.run(`k-${f.review.id}`, async () => { await api.admin.keepReview(f.review.id, note.trim()); await onDone(); }, 'Kept; flags dismissed')}
        />
      </Row>
    </Card>
  );
}

function ReportCard({ r, a, onDone }: { r: AdminReport; a: Action; onDone: () => void }) {
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const hideReason = moderationReason(choice, note);
  const what = r.targetType === 'post' ? 'Post' : 'Comment';
  return (
    <Card>
      <P><Text style={{ fontWeight: '600' }}>{what}</Text> in {r.hostelName} · {r.reports} report{r.reports === 1 ? '' : 's'} · {timeAgo(r.firstReportedAt)}</P>
      {r.content ? <P>{r.content.author}: {r.content.body}</P> : <P muted>Its author has deleted it. Keep to clear the reports.</P>}
      {r.content?.hidden && <Badge label="Hidden" tone="red" />}
      {r.reasons.map((x, i) => <P key={`${i}-${x}`} muted>• {x}</P>)}
      <Reason choice={choice} setChoice={setChoice} note={note} setNote={setNote} />
      <Row>
        {r.content && !r.content.hidden && (
          <Button
            small
            variant="danger"
            title={`Hide ${what.toLowerCase()}`}
            disabled={hideReason.length < 3}
            busy={a.busy === `h-${r.targetId}`}
            onPress={() => a.run(`h-${r.targetId}`, async () => { await api.admin.moderateContent(r.targetType, r.targetId, 'hide', hideReason); await onDone(); }, `${what} hidden`)}
          />
        )}
        <Button
          small
          variant="secondary"
          title="Keep it"
          disabled={note.trim().length < 3}
          busy={a.busy === `k-${r.targetId}`}
          onPress={() => a.run(`k-${r.targetId}`, async () => { await api.admin.moderateContent(r.targetType, r.targetId, 'keep', note.trim()); await onDone(); }, 'Kept; reports dismissed')}
        />
      </Row>
    </Card>
  );
}
