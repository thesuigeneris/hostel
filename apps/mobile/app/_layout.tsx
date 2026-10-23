import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="hostel/[id]"
          options={{ headerShown: true, title: '', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="subscribe"
          options={{ presentation: 'modal', headerShown: true, title: 'Subscribe' }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
