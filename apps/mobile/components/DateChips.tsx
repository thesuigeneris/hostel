import { Pressable, ScrollView, Text, View } from 'react-native';
import { dayOptions } from '@/lib/dates';
import { theme } from '@/lib/theme';

const c = theme.colors;

/** A row of the next few days to tap, instead of typing a date. */
export function DateChips({ label, from, value, onChange, days = 14, start = 0, hint }: { label: string; from: string; value: string; onChange: (iso: string) => void; days?: number; start?: number; hint?: string }) {
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
        {dayOptions(from, days, start).map((d) => {
          const on = d.iso === value;
          return (
            <Pressable
              key={d.iso}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${d.label}, ${d.sub}`}
              onPress={() => onChange(d.iso)}
              style={{ minWidth: 68, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: on ? c.brand : c.border, backgroundColor: on ? c.brand : c.surface }}
            >
              <Text style={{ fontWeight: '600', fontSize: 13, color: on ? c.white : c.text }}>{d.label}</Text>
              <Text style={{ fontSize: 12, color: on ? c.white : c.muted }}>{d.sub}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {hint ? <Text style={{ color: c.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}
