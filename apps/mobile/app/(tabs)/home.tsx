import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Hostel } from '@hostels/shared';
import { api } from '../../lib/api';
import { theme } from '../../lib/theme';

export default function Home() {
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.hostels.list();
      setHostels(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.bg,
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg }}
      data={hostels}
      keyExtractor={(h) => h.id}
      ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: theme.spacing.md }}>
          <Text style={{ fontSize: 14, color: theme.colors.muted }}>
            {hostels.length} places in Hyderabad
          </Text>
        </View>
      }
      renderItem={({ item }) => <HostelCard hostel={item} />}
    />
  );
}

function HostelCard({ hostel }: { hostel: Hostel }) {
  return (
    <TouchableOpacity
      onPress={() => router.push(`/hostel/${hostel.id}`)}
      style={{
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}
    >
      <Image source={{ uri: hostel.imageUrl }} style={{ width: '100%', height: 180 }} />
      <View style={{ padding: theme.spacing.lg }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.text }}>
            {hostel.name}
          </Text>
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.text }}>
            ₹{hostel.monthlyRent.toLocaleString('en-IN')}
          </Text>
        </View>
        <Text style={{ fontSize: 14, color: theme.colors.muted, marginTop: 2 }}>
          {hostel.area}, {hostel.city}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: theme.spacing.sm,
            gap: theme.spacing.sm,
            flexWrap: 'wrap',
          }}
        >
          <Pill text={hostel.sharingType} />
          {hostel.foodIncluded && <Pill text="Food included" tone="accent" />}
          <Pill
            text={`${hostel.bedsAvailable} beds left`}
            tone={hostel.bedsAvailable <= 3 ? 'danger' : 'muted'}
          />
        </View>
      </View>
    </TouchableOpacity>
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
