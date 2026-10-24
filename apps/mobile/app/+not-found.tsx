import { router, Stack } from 'expo-router';
import { Button, Empty, Screen } from '@/components/ui';

export default function NotFound() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Empty title="This page doesn't exist">The link may be old, or the hostel is no longer listed.</Empty>
      <Button title="Find a hostel" onPress={() => router.replace('/')} />
    </Screen>
  );
}
