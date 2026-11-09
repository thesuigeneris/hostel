import { dateLabel, monthLabel, type Review, reviewSource } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { HostelHeader, Upsell, whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, Empty, ErrorText, Field, Notice, P, Row, Screen, Stars } from '@/components/ui';
import { api } from '@/lib/api';
import { hasPlan } from '@/lib/owner';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

const PAGE_SIZE = 20;

export default function ReviewsScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Reviews' }} />
      <Reviews />
    </RoleGate>
  );
}

function Reviews() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useLoad(async () => {
    const [h, reviews] = await Promise.all([api.owner.hostel(id), api.owner.reviews(id)]);
    return { h, reviews, more: reviews.length === PAGE_SIZE, page: 1 };
  }, [id]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const data = s.data!;
  const { h, reviews } = data;
  const canReply = hasPlan(h.plan.effective, 'pro');
  const replaced = (r: Review) => s.setData({ ...data, reviews: reviews.map((x) => (x.id === r.id ? r : x)) });
  const older = () =>
    a.run('older', async () => {
      const next = await api.owner.reviews(id, data.page + 1);
      s.setData({ ...data, reviews: [...reviews, ...next], more: next.length === PAGE_SIZE, page: data.page + 1 });
    });

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      <P muted>Only verified residents can review, after two weeks of stay. You can't remove reviews, but a calm, specific reply goes a long way. Reviews waiting for your reply come first.</P>
      {h.ratings.rating !== null && <Row><Stars value={h.ratings.rating} /><P muted>from {h.ratings.reviewCount} reviews</P></Row>}
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      {!canReply && reviews.length > 0 && <Upsell hostelId={id} plan="pro" feature="Replying to reviews" suspended={h.plan.suspended} />}
      {reviews.length === 0 && <Empty title="No reviews yet">Residents can review after 14 days. Add residents (Pro) or take subscriptions (Partner) so they can.</Empty>}
      {reviews.map((r) => <ReviewCard key={r.id} r={r} a={a} canReply={canReply} onSaved={replaced} />)}
      {data.more && <Button variant="secondary" title="Show older reviews" busy={a.busy === 'older'} onPress={older} />}
    </Screen>
  );
}

function ReviewCard({ r, a, canReply, onSaved }: { r: Review; a: ReturnType<typeof useAction>; canReply: boolean; onSaved: (r: Review) => void }) {
  const [reply, setReply] = useState(r.ownerReply ?? '');
  const [editing, setEditing] = useState(false);
  const source = reviewSource(r.verifiedVia);
  const key = `reply-${r.id}`;
  const save = () =>
    a.run(
      key,
      async () => {
        onSaved(r.ownerReply ? await api.owner.editReply(r.id, reply.trim()) : await api.owner.reply(r.id, reply.trim()));
        setEditing(false);
      },
      r.ownerReply ? 'Reply updated. It now shows as edited.' : 'Reply posted',
    );
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '600', color: theme.colors.text, flexShrink: 1 }}>{r.author}</Text>
        <Stars value={r.rating} />
      </Row>
      <Row>
        <Badge label={source.label} tone={source.strong ? 'green' : 'gray'} />
        {r.stay && <P muted>{monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'}</P>}
        {r.hidden && <Badge label="Hidden by moderators" tone="red" />}
        {!r.ownerReply && <Badge label="Waiting for your reply" tone="food" />}
      </Row>
      <P muted>Written {dateLabel(r.createdAt)} · Cleanliness {r.cleanliness} · Food {r.food ?? '—'} · Safety {r.safety} · Response {r.responsiveness}</P>
      <P>{r.body}</P>
      {r.ownerReply && !editing ? (
        <View style={{ backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm, padding: theme.spacing.md, gap: 4 }}>
          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>
            Your public reply{r.ownerRepliedAt ? ` · ${dateLabel(r.ownerRepliedAt)}` : ''}
            {r.ownerReplyEditedAt ? ` · edited ${dateLabel(r.ownerReplyEditedAt)}` : ''}
          </Text>
          <P>{r.ownerReply}</P>
          {canReply && <Button small variant="ghost" title="Edit reply" onPress={() => setEditing(true)} />}
        </View>
      ) : (
        canReply && (
          <>
            <Field
              label={r.ownerReply ? 'Edit your reply' : 'Your public reply'}
              hint={r.ownerReply ? 'Readers will see that the reply was edited, and when.' : undefined}
              value={reply}
              onChangeText={setReply}
              multiline
              maxLength={1000}
              placeholder="Reply publicly"
            />
            <Row>
              <Button small variant="secondary" title={r.ownerReply ? 'Save changes' : 'Reply'} disabled={reply.trim().length < 2} busy={a.busy === key} onPress={save} />
              {editing && <Button small variant="ghost" title="Cancel" onPress={() => { setReply(r.ownerReply ?? ''); setEditing(false); }} />}
            </Row>
          </>
        )
      )}
    </Card>
  );
}
