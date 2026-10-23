import { Tabs } from 'expo-router';
import { theme } from '../../lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: { borderTopColor: theme.colors.border },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Browse', tabBarLabel: 'Browse' }} />
      <Tabs.Screen name="plan" options={{ title: 'My Plan', tabBarLabel: 'My Plan' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile' }} />
    </Tabs>
  );
}
