import { type CommunityPost, POST_KINDS, type PostKind, timeAgo, titleCase } from '@hostels/shared';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, Field, P, Row } from '@/components/ui';
import { api } from '@/lib/api';
import { confirm, type useAction } from '@/lib/ownerAction';
import { pickAndUploadPhoto } from '@/lib/ownerUpload';
import { theme } from '@/lib/theme';
import { Choice } from './parts';

const c = theme.colors;

function Tiny({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={{ color: danger ? c.danger : c.muted, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

/** The community board as the owner sees it: post announcements, pin, hide and delete posts and comments, reply. */
export function OwnerFeed({ hostelId, posts, a, onChanged }: { hostelId: string; posts: CommunityPost[]; a: ReturnType<typeof useAction>; onChanged: () => Promise<void> | void }) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<PostKind>('announcement');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});

  const act = (key: string, fn: () => Promise<unknown>, done?: string) =>
    a.run(key, async () => {
      await fn();
      await onChanged();
    }, done);

  const remove = async (what: 'post' | 'comment', id: string) => {
    if (!(await confirm(`Delete this ${what}? This can't be undone.`, 'Delete'))) return;
    act(`del-${id}`, () => (what === 'post' ? api.resident.deletePost(id) : api.resident.deleteComment(id)));
  };

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Card>
        <Field label="Post to residents" value={body} onChangeText={setBody} multiline maxLength={1000} placeholder="Post an announcement for residents" />
        <Choice value={kind} options={POST_KINDS.map((k) => ({ value: k, label: titleCase(k) }))} onChange={setKind} />
        {photoUrl ? <Image source={{ uri: photoUrl }} style={{ height: 140, borderRadius: theme.radius.sm }} accessibilityLabel="Attached photo" /> : null}
        <Row>
          <Button
            small
            variant="secondary"
            title={photoUrl ? 'Change photo' : 'Add a photo'}
            busy={a.busy === 'photo'}
            onPress={() => a.run('photo', async () => { const url = await pickAndUploadPhoto(); if (url) setPhotoUrl(url); })}
          />
          {photoUrl ? <Button small variant="ghost" title="Remove photo" onPress={() => setPhotoUrl(null)} /> : null}
        </Row>
        <Button
          title="Post"
          busy={a.busy === 'post'}
          disabled={!body.trim()}
          onPress={() => act('post', async () => {
            await api.resident.post(hostelId, { kind, body, photoUrl });
            setBody('');
            setPhotoUrl(null);
          }, 'Posted')}
        />
      </Card>

      {posts.length === 0 && <Empty title="Nothing here yet">Post an announcement to start the board.</Empty>}
      {posts.map((p) => (
        <Card key={p.id} style={p.hidden ? { opacity: 0.6 } : undefined}>
          <Row>
            <Text style={{ fontWeight: '600', color: c.text }}>{p.author}</Text>
            <Badge label={titleCase(p.kind)} tone={p.kind === 'announcement' ? 'green' : p.kind === 'food' ? 'food' : 'gray'} />
            {p.pinned && <Badge label="Pinned" tone="green" />}
            {p.hidden && <Badge label="Hidden" tone="red" />}
            <P muted>{timeAgo(p.createdAt)}</P>
          </Row>
          <P>{p.body}</P>
          {p.photoUrl ? <Image source={{ uri: p.photoUrl }} style={{ height: 200, borderRadius: theme.radius.sm }} accessibilityLabel="Attached to the post" /> : null}
          <Row>
            <Tiny label={p.pinned ? 'Unpin' : 'Pin'} onPress={() => act(`pin-${p.id}`, () => api.resident.moderatePost(p.id, { pinned: !p.pinned }))} />
            <Tiny label={p.hidden ? 'Unhide' : 'Hide'} onPress={() => act(`hide-${p.id}`, () => api.resident.moderatePost(p.id, { hidden: !p.hidden }))} />
            <Tiny label="Delete" danger onPress={() => remove('post', p.id)} />
          </Row>
          {p.comments.map((cm) => (
            <View key={cm.id} style={{ borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: theme.spacing.sm, gap: 2, opacity: cm.hidden ? 0.6 : 1 }}>
              <Text style={{ color: c.soft, fontSize: 14 }}>
                <Text style={{ fontWeight: '600', color: c.text }}>{cm.author}</Text> {cm.body} <Text style={{ color: c.muted, fontSize: 12 }}>{timeAgo(cm.createdAt)}</Text>
              </Text>
              <Row>
                <Tiny label={cm.hidden ? 'Unhide' : 'Hide'} onPress={() => act(`hidec-${cm.id}`, () => api.resident.moderateComment(cm.id, !cm.hidden))} />
                <Tiny label="Delete" danger onPress={() => remove('comment', cm.id)} />
              </Row>
            </View>
          ))}
          <Row style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}>
              <Field label="Reply" value={replies[p.id] ?? ''} onChangeText={(v) => setReplies({ ...replies, [p.id]: v })} maxLength={500} />
            </View>
          </Row>
          <Button
            small
            variant="secondary"
            title="Reply"
            busy={a.busy === `reply-${p.id}`}
            disabled={!(replies[p.id] ?? '').trim()}
            onPress={() => act(`reply-${p.id}`, async () => {
              await api.resident.comment(p.id, replies[p.id]!.trim());
              setReplies({ ...replies, [p.id]: '' });
            })}
          />
        </Card>
      ))}
    </View>
  );
}
