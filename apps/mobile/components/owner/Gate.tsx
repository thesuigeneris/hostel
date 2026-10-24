import type { Role } from '@hostels/shared';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Button, Empty, Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Shows its children only to the right role. Admins pass the owner gate too, as they do in the API. */
export function RoleGate({ need: role, children }: { need: 'owner' | 'admin'; children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) {
    return (
      <Screen>
        <Empty title="Log in first">{role === 'admin' ? 'The admin console needs an admin account.' : 'Log in with the phone number you use for your hostel.'}</Empty>
        <Button title={role === 'owner' ? 'Log in as an owner' : 'Log in'} onPress={() => router.push(role === 'owner' ? '/owner/join' : '/login')} />
      </Screen>
    );
  }
  if (!allowed(user.role, role)) {
    return (
      <Screen>
        <Empty title={role === 'admin' ? 'Admins only' : 'This is for hostel owners'}>
          {role === 'admin' ? 'Your account does not have admin access.' : 'List your hostel free to get the owner dashboard.'}
        </Empty>
        {role === 'owner' && <Button title="List your hostel" onPress={() => router.replace('/owner/join')} />}
      </Screen>
    );
  }
  return <>{children}</>;
}

const allowed = (have: Role, need: 'owner' | 'admin') => have === 'admin' || have === need;
