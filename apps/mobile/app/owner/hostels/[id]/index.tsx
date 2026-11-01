import { OWNER_PLANS } from '@hostels/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { RoleGate } from '@/components/owner/Gate';
import { HostelHeader, NavRow, whileLoading } from '@/components/owner/parts';
import { Button, Card, ErrorText, H2, Notice, P, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { HOSTEL_SECTIONS, missingForSubmit, sectionLocked } from '@/lib/owner';
import { useAction } from '@/lib/ownerAction';
import { useLoad } from '@/lib/useLoad';

export default function OwnerHostelScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Manage hostel' }} />
      <OwnerHostel />
    </RoleGate>
  );
}

function OwnerHostel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useLoad(() => api.owner.hostel(id), [id]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const h = s.data!;
  const missing = missingForSubmit(h);

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <Stack.Screen options={{ title: h.name }} />
      <HostelHeader h={h} />
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>

      {(h.status === 'draft' || h.status === 'rejected') && (
        <Card tone="brand">
          <H2>{h.status === 'rejected' ? 'Fix and resubmit' : 'Ready to go live?'}</H2>
          <P>
            {h.status === 'rejected' && h.rejectionReason ? `Our team said: ${h.rejectionReason}. ` : ''}
            {missing.length ? `Add ${missing.join(' and ')} first.` : 'Send it for review. We usually approve within a day.'}
          </P>
          <Button
            title="Submit for review"
            disabled={missing.length > 0}
            busy={a.busy === 'submit'}
            onPress={() => a.run('submit', async () => s.setData({ ...h, ...(await api.owner.submit(id)) }), 'Sent for review. We usually approve within a day.')}
          />
        </Card>
      )}
      {h.status === 'pending' && <Card tone="food"><P>Your listing is in review. You can keep editing meanwhile.</P></Card>}

      {HOSTEL_SECTIONS.map((sec) => (
        <NavRow
          key={sec.path}
          title={sec.label}
          hint={sec.hint}
          locked={sectionLocked(sec, h.plan.effective) ? OWNER_PLANS[sec.needs!].label : undefined}
          onPress={() => router.push(`/owner/hostels/${id}/${sec.path}`)}
        />
      ))}
      {h.status === 'live' && (
        <Button title="View public page" variant="secondary" onPress={() => router.push(`/hostel/${h.slug}`)} />
      )}
    </Screen>
  );
}
