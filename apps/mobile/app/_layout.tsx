import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/auth';
import { theme } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.bg },
            headerShadowVisible: false,
            headerTintColor: theme.colors.brand,
            headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
            contentStyle: { backgroundColor: theme.colors.bg },
            headerBackTitle: 'Back',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ presentation: 'modal', title: 'Log in' }} />
          <Stack.Screen name="hostel/[slug]" options={{ title: '' }} />
          <Stack.Screen name="subscribe/[slug]" options={{ title: 'Subscribe' }} />
          <Stack.Screen name="move" options={{ title: 'Move' }} />
          <Stack.Screen name="home/[hostelId]" options={{ title: 'My hostel' }} />
          <Stack.Screen name="issue/[id]" options={{ title: 'Issue' }} />
          <Stack.Screen name="hostels-in/[area]" options={{ title: 'Hostels' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
