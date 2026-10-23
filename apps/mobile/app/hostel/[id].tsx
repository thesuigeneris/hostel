import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Hostel } from '@hostels/shared';
import { api } from '../../lib/api';
import { theme } from '../../lib/theme';

export default function HostelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [hostel, setHostel] = useState<Hostel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.hostels
      .get(id)
      .then(setHostel)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!hostel) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.xl }}>
        <Text>Not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Image source={{ uri: hostel.imageUrl }} style={{ width: '100%', height: 260 }} />
        <View style={{ padding: theme.spacing.xl }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: theme.colors.text }}>
            {hostel.name}
          </Text>
          <Text style={{ fontSize: 15, color: theme.colors.muted, marginTop: 4 }}>
            {hostel.area}, {hostel.city}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
              marginTop: theme.spacing.lg,
            }}
          >
            <Pill text={hostel.sharingType} />
            <Pill
              text={hostel.foodIncluded ? 'Food included' : 'Food not included'}
              tone={hostel.foodIncluded ? 'accent' : 'muted'}
            />
            <Pill
              text={`${hostel.bedsAvailable}/${hostel.totalBeds} available`}
              tone={hostel.bedsAvailable <= 3 ? 'danger' : 'muted'}
            />
          </View>

          <Text
            style={{
              fontSize: 16,
              color: theme.colors.text,
              marginTop: theme.spacing.xl,
              lineHeight: 24,
            }}
          >
            {hostel.description}
          </Text>

          <Text
            style={{
              fontSize: 13,
              color: theme.colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginTop: theme.spacing.xxl,
            }}
          >
            Amenities
          </Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
              marginTop: theme.spacing.md,
            }}
          >
            {hostel.amenities.map((a) => (
              <View
                key={a}
                style={{
                  backgroundColor: theme.colors.surface,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderRadius: theme.radius.md,
                }}
              >
                <Text style={{ fontSize: 14, color: theme.colors.text }}>{a}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.xl,
          backgroundColor: theme.colors.bg,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: theme.colors.text }}>
            ₹{hostel.monthlyRent.toLocaleString('en-IN')}
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.muted }}>per month, no advance</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/subscribe', params: { hostelId: hostel.id } })}
          disabled={hostel.bedsAvailable <= 0}
          style={{
            backgroundColor: theme.colors.primary,
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.md,
            borderRadius: theme.radius.md,
            opacity: hostel.bedsAvailable <= 0 ? 0.4 : 1,
          }}
        >
          <Text style={{ color: theme.colors.primaryText, fontSize: 16, fontWeight: '700' }}>
            {hostel.bedsAvailable <= 0 ? 'Full' : 'Subscribe'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Pill({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'accent' | 'danger' }) {
  const bg =
    tone === 'accent'
      ? theme.colors.accentBg
      : tone === 'danger'
        ? theme.colors.dangerBg
        : theme.colors.bg;
  const fg =
    tone === 'accent'
      ? theme.colors.accent
      : tone === 'danger'
        ? theme.colors.danger
        : theme.colors.muted;
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text style={{ fontSize: 12, color: fg, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}
