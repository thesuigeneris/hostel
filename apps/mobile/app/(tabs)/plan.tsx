import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Hostel, Subscription } from '@hostels/shared';
import { api } from '../../lib/api';
import { theme } from '../../lib/theme';

export default function Plan() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [hostel, setHostel] = useState<Hostel | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await api.me.subscription();
    setSub(s);
    if (s) {
      const h = await api.hostels.get(s.hostelId);
      setHostel(h);
    } else {
      setHostel(null);
    }
    setLoading(false);
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

  if (!sub || !hostel) {
    return (
      <View
        style={{
          flex: 1,
          padding: theme.spacing.xl,
          justifyContent: 'center',
          backgroundColor: theme.colors.bg,
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: theme.colors.text,
            marginBottom: theme.spacing.sm,
          }}
        >
          No active plan
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.muted,
            marginBottom: theme.spacing.xl,
            lineHeight: 22,
          }}
        >
          Browse partner hostels and subscribe to start. One monthly fee. Food + bed bundled. No
          advance.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/home')}
          style={{
            backgroundColor: theme.colors.primary,
            paddingVertical: theme.spacing.lg,
            borderRadius: theme.radius.md,
          }}
        >
          <Text
            style={{
              color: theme.colors.primaryText,
              textAlign: 'center',
              fontSize: 16,
              fontWeight: '600',
            }}
          >
            Browse hostels
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cancel = () => {
    Alert.alert(
      'Cancel subscription?',
      'You will lose access at the end of your current billing period.',
      [
        { text: 'Keep plan', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await api.cancelSubscription(sub.id);
              await load();
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, padding: theme.spacing.xl, backgroundColor: theme.colors.bg }}>
      <Text
        style={{
          fontSize: 13,
          color: theme.colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Active subscription
      </Text>
      <Text style={{ fontSize: 28, fontWeight: '800', color: theme.colors.text, marginTop: 4 }}>
        {hostel.name}
      </Text>
      <Text style={{ fontSize: 15, color: theme.colors.muted, marginTop: 2 }}>
        {hostel.area}, {hostel.city}
      </Text>

      <View
        style={{
          marginTop: theme.spacing.xl,
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          gap: theme.spacing.md,
        }}
      >
        <Row label="Monthly amount" value={`₹${sub.monthlyAmount.toLocaleString('en-IN')}`} />
        <Row label="Started" value={sub.startDate} />
        <Row label="Sharing" value={hostel.sharingType} />
        <Row label="Meal plan" value={sub.mealPlan} />
      </View>

      <TouchableOpacity
        onPress={cancel}
        disabled={cancelling}
        style={{
          marginTop: theme.spacing.xl,
          paddingVertical: theme.spacing.lg,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text
          style={{
            color: theme.colors.danger,
            textAlign: 'center',
            fontSize: 15,
            fontWeight: '600',
          }}
        >
          {cancelling ? 'Cancelling...' : 'Cancel subscription'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 14, color: theme.colors.muted }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>{value}</Text>
    </View>
  );
}
