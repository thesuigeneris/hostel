import { monthLabel, type Review } from '@hostels/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { HostelHeader, whileLoading } from '@/components/owner/parts';
import { Badge, Button, Card, Empty, ErrorText, Field, Notice, P, Row, Screen, Stars } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

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
    return { h, reviews };
  }, [id]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const { h, reviews } = s.data!;
  const replaced = (r: Review) => s.setData({ h, reviews: reviews.map((x) => (x.id === r.id ? r : x)) });

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      <P muted>Only verified residents can review, after two weeks of stay. You can't remove reviews, but a calm, specific reply goes a long way.</P>
      {h.ratings.rating !== null && <Row><Stars value={h.ratings.rating} /><P muted>from {h.ratings.reviewCount} reviews</P></Row>}
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      {reviews.length === 0 && <Empty title="No reviews yet">Add residents (Pro) or take subscriptions (Partner) so they can review.</Empty>}
      {reviews.map((r) => <ReviewCard key={r.id} r={r} a={a} onReplied={replaced} />)}
    </Screen>
  );
}

function ReviewCard({ r, a, onReplied }: { r: Review; a: ReturnType<typeof useAction>; onReplied: (r: Review) => void }) {
  const [reply, setReply] = useState(r.ownerReply ?? '');
  return (
    <Card style={r.hidden ? { opacity: 0.6 } : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '600', color: theme.colors.text }}>{r.author}</Text>
        <Stars value={r.rating} />
      </Row>
      <Row>
        {r.stay && <P muted>{monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'}</P>}
        {r.hidden && <Badge label="Hidden by moderators" tone="red" />}
      </Row>
      <P muted>Cleanliness {r.cleanliness} · Food {r.food ?? '—'} · Safety {r.safety} · Response {r.responsiveness}</P>
      <P>{r.body}</P>
      <Field label="Your public reply" value={reply} onChangeText={setReply} multiline maxLength={1000} placeholder="Reply publicly" />
      <Button
        small
        variant="secondary"
        title={r.ownerReply ? 'Update reply' : 'Reply'}
        disabled={reply.trim().length < 2}
        busy={a.busy === `reply-${r.id}`}
        onPress={() => a.run(`reply-${r.id}`, async () => onReplied(await api.owner.reply(r.id, reply.trim())), 'Reply posted')}
      />
    </Card>
  );
}
