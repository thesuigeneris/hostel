import { OWNER_PLANS, type OwnerHostelDetail, type OwnerPlanTier } from '@hostels/shared';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Chip, ErrorText, H2, Loading, P, Row, Screen, StatusBadge } from '@/components/ui';
import { theme } from '@/lib/theme';

const c = theme.colors;

/** A big number with a label, like the website's dashboard stats. */
export function Stat({ label, value, hint, onPress }: { label: string; value: ReactNode; hint?: string; onPress?: () => void }) {
  const body = (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: theme.radius.md, padding: theme.spacing.md, minWidth: 140, flexGrow: 1, flexBasis: '45%' }}>
      <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: onPress ? c.brand : c.text, fontSize: 24, fontWeight: '700', marginTop: 2 }}>{value}</Text>
      {hint ? <Text style={{ color: c.soft, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flexGrow: 1, flexBasis: '45%' }}>
      {body}
    </Pressable>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>{children}</View>;
}

/** A tappable row that opens another screen. */
export function NavRow({ title, hint, onPress, locked, badge }: { title: string; hint?: string; onPress: () => void; locked?: string; badge?: ReactNode }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: theme.radius.md, padding: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{title}</Text>
          {hint ? <Text style={{ color: c.muted, fontSize: 13 }}>{hint}</Text> : null}
        </View>
        {badge}
        {locked ? <Badge label={locked} tone="food" /> : null}
        <Text style={{ color: c.muted, fontSize: 18 }}>›</Text>
      </View>
    </Pressable>
  );
}

/** First load failed: say why and offer a retry. */
export function Failed({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Screen>
      <Card tone="danger">
        <H2>Couldn't load this</H2>
        <ErrorText>{error ?? 'Something went wrong'}</ErrorText>
        <Button small variant="secondary" title="Try again" onPress={onRetry} />
      </Card>
    </Screen>
  );
}

/** Renders loading and first-load errors for a `useLoad` result, so screens only handle the loaded case. */
export function whileLoading(s: { loading: boolean; data: unknown; error: string | null; reload: () => void }) {
  if (s.loading && s.data === undefined) return <Loading />;
  if (s.data === undefined) return <Failed error={s.error} onRetry={s.reload} />;
  return null;
}

/** A feature the hostel's plan doesn't include yet. */
export function Upsell({ hostelId, plan, feature, suspended }: { hostelId: string; plan: OwnerPlanTier; feature: string; suspended?: boolean }) {
  return (
    <Card tone="food">
      <H2>{feature} is part of {OWNER_PLANS[plan].label}</H2>
      <P>{suspended ? 'Your plan is paused because a bill is overdue. Pay it to turn everything back on.' : `Upgrade this hostel to ${OWNER_PLANS[plan].label}. The first month is free.`}</P>
      <Button title={suspended ? 'Pay the bill' : 'See plans'} variant="food" onPress={() => router.push(`/owner/hostels/${hostelId}/plan`)} />
    </Card>
  );
}

/** The hostel's name, listing status and plan, shown at the top of each hostel screen. */
export function HostelHeader({ h }: { h: OwnerHostelDetail }) {
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 20 }}>{h.name}</Text>
      <Row>
        <StatusBadge status={h.status} />
        <Badge label={`${OWNER_PLANS[h.plan.effective].label} plan`} tone={h.plan.effective === 'free' ? 'gray' : 'green'} />
        {h.plan.suspended && <Badge label="Paused: bill overdue" tone="red" />}
        {h.isVerified && <Badge label="✓ Verified partner" tone="green" />}
        {h.partnerStatus === 'applied' && <Badge label="Partner review pending" tone="food" />}
      </Row>
    </View>
  );
}

/** Previous / label / next, for weeks, days and months. */
export function Stepper({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <Button small variant="secondary" title="‹ Prev" onPress={onPrev} />
      <Text style={{ color: c.text, fontWeight: '600', flexShrink: 1, textAlign: 'center' }}>{label}</Text>
      <Button small variant="secondary" title="Next ›" onPress={onNext} />
    </Row>
  );
}

/** One-of-many choice as chips, used in place of a select. */
export function Choice<T extends string>({ label, value, options, onChange }: { label?: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ gap: theme.spacing.xs }}>
      {label ? <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{label}</Text> : null}
      <Row>{options.map((o) => <Chip key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} />)}</Row>
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: value ? c.brand : c.border, backgroundColor: value ? c.brand : c.surface, alignItems: 'center', justifyContent: 'center' }}>
        {value ? <Text style={{ color: c.white, fontSize: 14, fontWeight: '700' }}>✓</Text> : null}
      </View>
      <Text style={{ color: c.text, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={{ color: c.muted, fontSize: 12 }}>{children}</Text>;
}
