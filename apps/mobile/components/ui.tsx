import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { theme } from '@/lib/theme';

const c = theme.colors;
const sp = theme.spacing;

export function Screen({ children, refreshing, onRefresh, padded = true }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; padded?: boolean }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={padded ? { padding: sp.lg, paddingBottom: sp.xxl * 2, gap: sp.lg } : undefined}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.brand} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: 'brand' | 'food' | 'danger' }) {
  const toneStyle = tone === 'brand' ? { backgroundColor: c.brandSoft, borderColor: c.brandSoft } : tone === 'food' ? { backgroundColor: c.foodSoft, borderColor: c.food } : tone === 'danger' ? { backgroundColor: c.dangerSoft, borderColor: c.dangerSoft } : null;
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'food' | 'danger';
export function Button({ title, onPress, variant = 'primary', disabled, busy, small, style }: { title: string; onPress: () => void; variant?: Variant; disabled?: boolean; busy?: boolean; small?: boolean; style?: ViewStyle }) {
  const v = {
    primary: { bg: c.brand, fg: c.white, border: c.brand },
    secondary: { bg: c.surface, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.soft, border: 'transparent' },
    food: { bg: c.food, fg: c.white, border: c.food },
    danger: { bg: c.danger, fg: c.white, border: c.danger },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={v.fg} /> : <Text style={[styles.buttonText, small && { fontSize: 13 }, { color: v.fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}
export function P({ children, muted, style, numberOfLines }: { children: ReactNode; muted?: boolean; style?: TextStyle; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[styles.p, muted && { color: c.muted, fontSize: 13 }, style]}>{children}</Text>;
}

const BADGE = {
  green: { bg: c.brandSoft, fg: c.brand },
  food: { bg: c.foodSoft, fg: c.food },
  gray: { bg: c.bg, fg: c.soft },
  red: { bg: c.dangerSoft, fg: c.danger },
};
export function Badge({ label, tone = 'gray' }: { label: string; tone?: keyof typeof BADGE }) {
  return (
    <View style={[styles.badge, { backgroundColor: BADGE[tone].bg }]}>
      <Text style={{ color: BADGE[tone].fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

const STATUS_TONE: Record<string, keyof typeof BADGE> = {
  live: 'green', active: 'green', paid: 'green', resolved: 'green', contacted: 'green', verified: 'green',
  pending: 'food', due: 'food', invited: 'food', acknowledged: 'food', in_progress: 'food', scheduled: 'food', new: 'food',
  overdue: 'red', open: 'red', rejected: 'red',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge label={status.replace(/_/g, ' ')} tone={STATUS_TONE[status] ?? 'gray'} />;
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress} style={[styles.chip, active && { backgroundColor: c.brand, borderColor: c.brand }]}>
      <Text style={{ color: active ? c.white : c.soft, fontSize: 13, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: sp.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={c.muted} {...props} style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top', paddingTop: sp.sm }, props.style]} />
      {hint ? <Text style={{ color: c.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 14 }}>{children}</Text>;
}

export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={{ color: c.brand, fontSize: 14, backgroundColor: c.brandSoft, padding: sp.md, borderRadius: theme.radius.sm, overflow: 'hidden' }}>{children}</Text>;
}

export function Loading() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: sp.xxl, backgroundColor: c.bg }}><ActivityIndicator color={c.brand} /></View>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontWeight: '600', color: c.text, textAlign: 'center' }}>{title}</Text>
      {children ? <Text style={{ color: c.soft, textAlign: 'center', marginTop: sp.xs }}>{children}</Text> : null}
    </View>
  );
}

export function Stars({ value }: { value: number | null }) {
  if (value === null) return <Text style={{ color: c.muted, fontSize: 13 }}>No reviews yet</Text>;
  const full = Math.round(value);
  return (
    <Text style={{ fontSize: 13 }} accessibilityLabel={`${value} out of 5`}>
      <Text style={{ color: c.food }}>{'★'.repeat(full)}</Text>
      <Text style={{ color: c.border }}>{'★'.repeat(5 - full)}</Text>
      <Text style={{ color: c.text, fontWeight: '600' }}> {value.toFixed(1)}</Text>
    </Text>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: sp.sm, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: o.value === value }} onPress={() => onChange(o.value)} style={[styles.segment, o.value === value && { backgroundColor: c.brand }]}>
          <Text style={{ color: o.value === value ? c.white : c.soft, fontWeight: '500', fontSize: 13 }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: c.border, padding: sp.lg, gap: sp.sm },
  button: { height: 46, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp.lg, borderWidth: 1 },
  buttonSmall: { height: 34, paddingHorizontal: sp.md, borderRadius: theme.radius.sm },
  buttonText: { fontSize: 15, fontWeight: '600' },
  h1: { fontSize: 24, fontWeight: '700', color: c.text },
  h2: { fontSize: 18, fontWeight: '700', color: c.text },
  p: { fontSize: 15, color: c.soft, lineHeight: 21 },
  badge: { borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  chip: { borderRadius: theme.radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 7 },
  label: { fontSize: 14, fontWeight: '600', color: c.text },
  input: { borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: theme.radius.sm, paddingHorizontal: sp.md, height: 44, fontSize: 15, color: c.text },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: theme.radius.md, padding: sp.xl, alignItems: 'center' },
  segmented: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: c.border, padding: 3, gap: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: theme.radius.sm },
});
