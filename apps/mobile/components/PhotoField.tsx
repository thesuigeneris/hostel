import { useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { errorMessage } from '@/lib/api';
import { theme } from '@/lib/theme';
import { type Photo, pickPhoto } from '@/lib/upload';
import { Button, ErrorText, Row } from './ui';

/** An optional photo for a form: pick from the library or take one, see it, remove it. Uploading happens on submit. */
export function PhotoField({ value, onChange, label = 'Photo' }: { value: Photo | null; onChange: (p: Photo | null) => void; label?: string }) {
  const [err, setErr] = useState<string | null>(null);

  async function pick(source: 'library' | 'camera') {
    setErr(null);
    try {
      const p = await pickPhoto(source);
      if (p) onChange(p);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>{label}</Text>
      {value ? (
        <Row>
          <Image source={{ uri: value.uri }} style={{ width: 72, height: 72, borderRadius: theme.radius.sm, backgroundColor: theme.colors.brandSoft }} accessibilityLabel="Attached photo" />
          <Button small variant="ghost" title="Remove photo" onPress={() => onChange(null)} />
        </Row>
      ) : (
        <Row>
          <Button small variant="secondary" title="Add a photo" onPress={() => pick('library')} />
          {Platform.OS !== 'web' && <Button small variant="secondary" title="Take a photo" onPress={() => pick('camera')} />}
        </Row>
      )}
      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Optional. JPEG, PNG or WebP up to 5 MB.</Text>
      <ErrorText>{err}</ErrorText>
    </View>
  );
}
