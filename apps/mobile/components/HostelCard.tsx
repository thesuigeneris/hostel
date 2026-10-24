import { type HostelSummary, rupees, SHARING_LABEL, GENDER_LABEL } from '@hostels/shared';
import { router } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import { Badge, Row, Stars } from './ui';

export function HostelCard({ h }: { h: HostelSummary }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={h.name}
      onPress={() => router.push(`/hostel/${h.slug}`)}
      style={({ pressed }) => ({ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', opacity: pressed ? 0.9 : 1 })}
    >
      {h.coverPhotoUrl ? <Image source={{ uri: h.coverPhotoUrl }} style={{ height: 160, width: '100%', backgroundColor: theme.colors.brandSoft }} accessibilityIgnoresInvertColors /> : <View style={{ height: 160, backgroundColor: theme.colors.brandSoft }} />}
      <View style={{ padding: theme.spacing.md, gap: 6 }}>
        <Row>
          {h.isVerified ? <Badge label="✓ Verified · No advance" tone="green" /> : <Badge label="Free listing" />}
          <Badge label={GENDER_LABEL[h.genderType]} />
          {h.foodAvailable && <Badge label="Food" tone="food" />}
        </Row>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.text }}>{h.name}</Text>
        <Text style={{ color: theme.colors.soft }}>
          {h.area}
          {h.distanceKm !== undefined ? ` · ${h.distanceKm.toFixed(1)} km` : ''} · {h.sharingTypes.map((s) => SHARING_LABEL[s]).join(', ')}
        </Text>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>
            {rupees(h.minRent)}
            <Text style={{ fontSize: 13, fontWeight: '400', color: theme.colors.muted }}> /month</Text>
          </Text>
          <Stars value={h.rating} />
        </Row>
        <Text style={{ fontSize: 12, color: h.bedsAvailable ? theme.colors.brand : theme.colors.muted }}>{h.bedsAvailable ? `${h.bedsAvailable} beds free` : 'Full right now'}</Text>
      </View>
    </Pressable>
  );
}
