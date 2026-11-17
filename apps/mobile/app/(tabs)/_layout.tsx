import type { MySignals } from '@hostels/shared';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, type ColorValue, Text } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { tabBadge } from '@/lib/signals';
import { theme } from '@/lib/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

/** Updates on my issues I haven't opened: checked on start, when the app comes back to the front, and each minute. */
function useSignals() {
  const { user } = useAuth();
  const [signals, setSignals] = useState<MySignals | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when a different person signs in
  useEffect(() => {
    if (!user) return setSignals(null);
    const load = () => api.resident.signals().then(setSignals, () => {});
    load();
    const timer = setInterval(load, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [user?.id]);
  return signals;
}

export default function TabsLayout() {
  const badge = tabBadge(useSignals());
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: { borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Find a hostel', tabBarLabel: 'Explore', tabBarIcon: icon('⌕') }} />
      <Tabs.Screen
        name="stay"
        options={{
          title: 'My Stay',
          tabBarLabel: 'My Stay',
          tabBarIcon: icon('⌂'),
          tabBarBadge: badge,
          tabBarAccessibilityLabel: badge ? `My Stay, ${badge} ${badge === 1 ? 'issue has' : 'issues have'} new updates` : 'My Stay',
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile', tabBarIcon: icon('☺') }} />
    </Tabs>
  );
}
