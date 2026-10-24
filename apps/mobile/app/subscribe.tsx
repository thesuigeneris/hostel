import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Hostel, MealPlan } from '../lib/legacy-types';
import { api } from '../lib/api';
import { theme } from '../lib/theme';

const mealPlanCosts: Record<MealPlan, number> = {
  full: 0,
  'breakfast-only': -3000,
  none: -6000,
};

export default function Subscribe() {
  const { hostelId } = useLocalSearchParams<{ hostelId: string }>();
  const [hostel, setHostel] = useState<Hostel | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mealPlan, setMealPlan] = useState<MealPlan>('full');

  useEffect(() => {
    if (!hostelId) return;
    api.hostels
      .get(hostelId)
      .then(setHostel)
      .finally(() => setLoading(false));
  }, [hostelId]);

  if (loading || !hostel) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const total = hostel.monthlyRent + mealPlanCosts[mealPlan];

  const subscribe = async () => {
    setSubmitting(true);
    try {
      await new Promise<void>((r) => setTimeout(r, 1200));
      await api.subscribe({ hostelId: hostel.id, mealPlan });
      router.replace('/(tabs)/plan');
    } catch (e) {
      Alert.alert('Could not subscribe', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSubmitting(false);
    }
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
        Subscribing to
      </Text>
      <Text style={{ fontSize: 22, fontWeight: '700', color: theme.colors.text, marginTop: 4 }}>
        {hostel.name}
      </Text>
      <Text style={{ fontSize: 14, color: theme.colors.muted, marginTop: 2 }}>{hostel.area}</Text>

      <Text
        style={{
          fontSize: 13,
          color: theme.colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginTop: theme.spacing.xxl,
        }}
      >
        Meal plan
      </Text>
      <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <Option
          label="Full meal plan"
          sublabel="Breakfast + dinner, 7 days. South Indian / North Indian / Chinese rotation."
          selected={mealPlan === 'full'}
          onPress={() => setMealPlan('full')}
        />
        <Option
          label="Breakfast only"
          sublabel="Breakfast, 7 days. Skip dinner."
          selected={mealPlan === 'breakfast-only'}
          onPress={() => setMealPlan('breakfast-only')}
        />
        <Option
          label="No meals"
          sublabel="Bed only, manage your own food."
          selected={mealPlan === 'none'}
          onPress={() => setMealPlan('none')}
        />
      </View>

      <View
        style={{
          marginTop: theme.spacing.xxl,
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
        }}
      >
        <Row label="Bed" value={`₹${hostel.monthlyRent.toLocaleString('en-IN')}`} />
        <Row
          label="Meal plan adjustment"
          value={`${mealPlanCosts[mealPlan] >= 0 ? '+' : ''}₹${mealPlanCosts[mealPlan].toLocaleString('en-IN')}`}
        />
        <View
          style={{
            height: 1,
            backgroundColor: theme.colors.border,
            marginVertical: theme.spacing.md,
          }}
        />
        <Row label="Total per month" value={`₹${total.toLocaleString('en-IN')}`} bold />
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.accent,
            marginTop: theme.spacing.sm,
            fontWeight: '600',
          }}
        >
          No advance · Cancel anytime · Portable between partner properties
        </Text>
      </View>

      <TouchableOpacity
        onPress={subscribe}
        disabled={submitting}
        style={{
          backgroundColor: theme.colors.primary,
          paddingVertical: theme.spacing.lg,
          borderRadius: theme.radius.md,
          marginTop: theme.spacing.xxl,
          opacity: submitting ? 0.6 : 1,
        }}
      >
        <Text
          style={{
            color: theme.colors.primaryText,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: '700',
          }}
        >
          {submitting ? 'Processing payment...' : `Pay ₹${total.toLocaleString('en-IN')} & subscribe`}
        </Text>
      </TouchableOpacity>
      <Text
        style={{
          fontSize: 11,
          color: theme.colors.muted,
          textAlign: 'center',
          marginTop: theme.spacing.md,
        }}
      >
        Razorpay integration is stubbed for v0. Real autopay mandate ships next.
      </Text>
    </View>
  );
}

function Option({
  label,
  sublabel,
  selected,
  onPress,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        borderRadius: theme.radius.md,
        padding: theme.spacing.lg,
        backgroundColor: selected ? theme.colors.surface : theme.colors.bg,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text }}>{label}</Text>
      <Text style={{ fontSize: 13, color: theme.colors.muted, marginTop: 2 }}>{sublabel}</Text>
    </TouchableOpacity>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
      }}
    >
      <Text
        style={{ fontSize: 14, color: theme.colors.muted, fontWeight: bold ? '700' : '400' }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: bold ? 18 : 14,
          color: theme.colors.text,
          fontWeight: bold ? '800' : '600',
        }}
      >
        {value}
      </Text>
    </View>
  );
}
