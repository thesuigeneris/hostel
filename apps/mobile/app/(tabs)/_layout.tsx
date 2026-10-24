import { Tabs } from 'expo-router';
import { type ColorValue, Text } from 'react-native';
import { theme } from '@/lib/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
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
      <Tabs.Screen name="stay" options={{ title: 'My Stay', tabBarLabel: 'My Stay', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile', tabBarIcon: icon('☺') }} />
    </Tabs>
  );
}
