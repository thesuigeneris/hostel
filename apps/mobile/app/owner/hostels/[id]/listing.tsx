import { Stack, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { HostelForm } from '@/components/owner/HostelForm';
import { HostelHeader, whileLoading } from '@/components/owner/parts';
import { Button, Card, ErrorText, H2, Notice, P, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { coverOrder } from '@/lib/owner';
import { confirm, useAction } from '@/lib/ownerAction';
import { pickAndUploadPhoto } from '@/lib/ownerUpload';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function ListingScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Listing and photos' }} />
      <Listing />
    </RoleGate>
  );
}

function Listing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useLoad(() => api.owner.hostel(id), [id]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const h = s.data!;
  const ids = h.photos.map((p) => p.id);

  const upload = () =>
    a.run('upload', async () => {
      const url = await pickAndUploadPhoto();
      if (!url) return;
      await api.owner.addPhoto(id, url);
      await s.reload();
      a.setOk('Photo added');
    });

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <HostelHeader h={h} />
      <ErrorText>{a.error}</ErrorText>
      <Notice>{a.ok}</Notice>

      <Card>
        <H2>Photos</H2>
        <P muted>Real photos of rooms, bathrooms and the kitchen get the most calls. The first photo is the cover.</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {h.photos.map((p, i) => (
            <View key={p.id} style={{ width: '48%', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
              <Image source={{ uri: p.url }} style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: theme.colors.bg }} accessibilityLabel={`${h.name}, view ${i + 1}`} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: theme.spacing.sm }}>
                {i === 0 ? (
                  <Text style={{ color: theme.colors.brand, fontSize: 12, fontWeight: '600' }}>Cover</Text>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => a.run(`cover-${p.id}`, async () => s.setData({ ...h, photos: await api.owner.reorderPhotos(id, coverOrder(ids, p.id)) }), 'Cover photo set')}>
                    <Text style={{ color: theme.colors.soft, fontSize: 12 }}>Make cover</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    if (!(await confirm('Remove this photo from your listing?', 'Remove'))) return;
                    a.run(`del-${p.id}`, async () => {
                      await api.owner.deletePhoto(id, p.id);
                      s.setData({ ...h, photos: h.photos.filter((x) => x.id !== p.id) });
                    }, 'Photo removed');
                  }}
                >
                  <Text style={{ color: theme.colors.danger, fontSize: 12 }}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        <Button title="Add a photo" variant="secondary" busy={a.busy === 'upload'} onPress={upload} />
        <P muted>JPEG, PNG or WebP up to 5 MB.</P>
      </Card>

      <Card>
        <H2>Details</H2>
        <HostelForm
          key={h.id}
          hostel={h}
          submitLabel="Save changes"
          busy={a.busy === 'save'}
          onSubmit={(input) => a.run('save', async () => s.setData({ ...h, ...(await api.owner.update(id, input)) }), 'Saved')}
        />
        <ErrorText>{a.error}</ErrorText>
        <Notice>{a.ok}</Notice>
      </Card>
    </Screen>
  );
}
