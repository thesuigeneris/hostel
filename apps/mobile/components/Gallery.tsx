import type { HostelPhoto } from '@hostels/shared';
import { useState } from 'react';
import { FlatList, Image, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';

/** Swipeable hostel photos with a counter. Tapping one opens a full-screen viewer. */
export function Gallery({ photos, name, height = 260 }: { photos: HostelPhoto[]; name: string; height?: number }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <View style={{ height: 140, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.colors.brand }}>No photos yet</Text>
      </View>
    );
  }

  const pager = (h: number, onTap?: (i: number) => void, initial = 0, onIndex?: (i: number) => void) => (
    <FlatList
      data={photos}
      horizontal
      pagingEnabled
      initialScrollIndex={initial}
      getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      showsHorizontalScrollIndicator={false}
      keyExtractor={(p) => p.id}
      onMomentumScrollEnd={(e) => onIndex?.(Math.round(e.nativeEvent.contentOffset.x / width))}
      onScroll={(e) => onIndex?.(Math.round(e.nativeEvent.contentOffset.x / width))}
      scrollEventThrottle={64}
      renderItem={({ item, index: i }) => (
        <Pressable disabled={!onTap} onPress={() => onTap?.(i)} accessibilityRole={onTap ? 'imagebutton' : 'image'} accessibilityLabel={`${name}, photo ${i + 1} of ${photos.length}`}>
          <Image source={{ uri: item.url }} style={{ width, height: h, backgroundColor: onTap ? theme.colors.brandSoft : '#000' }} resizeMode={onTap ? 'cover' : 'contain'} />
        </Pressable>
      )}
    />
  );

  return (
    <View>
      {pager(height, setOpen, 0, setIndex)}
      <View style={{ position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
        <Text style={{ color: theme.colors.white, fontSize: 12, fontWeight: '600' }}>{index + 1} / {photos.length}</Text>
      </View>
      <Modal visible={open !== null} animationType="fade" onRequestClose={() => setOpen(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
          {open !== null && pager(Math.round(width * 1.2), undefined, open)}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photos"
            onPress={() => setOpen(null)}
            style={{ position: 'absolute', top: insets.top + 12, right: 16, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: theme.radius.pill, paddingHorizontal: 14, paddingVertical: 6 }}
          >
            <Text style={{ color: theme.colors.white, fontWeight: '600' }}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
