import { router, Stack } from 'expo-router';
import { RoleGate } from '@/components/owner/Gate';
import { HostelForm } from '@/components/owner/HostelForm';
import { Card, ErrorText, P, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/ownerAction';

export default function NewHostelScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'List your hostel' }} />
      <NewHostel />
    </RoleGate>
  );
}

function NewHostel() {
  const a = useAction();
  return (
    <Screen>
      <P>Free to list. You'll add rooms and photos next, then send it for a quick review.</P>
      <Card>
        <HostelForm
          submitLabel="Create listing"
          busy={a.busy === 'create'}
          onSubmit={(input) =>
            a.run('create', async () => {
              const h = await api.owner.create(input);
              router.replace(`/owner/hostels/${h.id}/rooms?ok=${encodeURIComponent('Listing created. Add your rooms next.')}`);
            })
          }
        />
        <ErrorText>{a.error}</ErrorText>
      </Card>
    </Screen>
  );
}
