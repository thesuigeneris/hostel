import { dateLabel, timeAgo, titleCase, VISIT_STATUSES, type VisitStatus } from '@hostels/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { Choice, whileLoading } from '@/components/owner/parts';
import { Button, Card, Empty, ErrorText, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { phoneLink, whatsappLink } from '@/lib/owner';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function VisitsScreen() {
  return (
    <RoleGate need="owner">
      <Stack.Screen options={{ title: 'Visit requests' }} />
      <Visits />
    </RoleGate>
  );
}

function Visits() {
  const [status, setStatus] = useState<VisitStatus | 'all'>('all');
  const s = useLoad(() => api.owner.visits(status === 'all' ? undefined : status), [status]);
  const a = useAction();
  const gate = whileLoading(s);
  if (gate) return gate;
  const visits = s.data!;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Call or WhatsApp back quickly; most tenants decide within a day.</P>
      <Choice value={status} options={[{ value: 'all', label: 'All' }, ...VISIT_STATUSES.map((v) => ({ value: v, label: titleCase(v) }))]} onChange={setStatus} />
      <ErrorText>{a.error ?? s.error}</ErrorText>
      {visits.length === 0 ? <Empty title="No visit requests here" /> : visits.map((v) => (
        <Card key={v.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '600', color: theme.colors.text, flex: 1 }}>{v.visitor.name || 'Someone'} wants to visit {v.hostelName}</Text>
            <StatusBadge status={v.status} />
          </Row>
          <P muted>On {dateLabel(v.preferredDate)} · asked {timeAgo(v.createdAt)}{v.message ? ` · “${v.message}”` : ''}</P>
          <Row>
            <Button small variant="secondary" title={`Call +91 ${v.visitor.phone}`} onPress={() => Linking.openURL(phoneLink(v.visitor.phone))} />
            <Button small variant="secondary" title="WhatsApp" onPress={() => Linking.openURL(whatsappLink(v.visitor.phone, `Hi ${v.visitor.name}, this is ${v.hostelName} about your visit.`))} />
          </Row>
          <Row>
            {VISIT_STATUSES.filter((st) => st !== v.status && st !== 'new').map((st) => (
              <Button
                key={st}
                small
                title={st === 'contacted' ? 'Mark contacted' : 'Close'}
                variant={st === 'contacted' ? 'primary' : 'ghost'}
                busy={a.busy === `${v.id}-${st}`}
                onPress={() => a.run(`${v.id}-${st}`, async () => { await api.owner.setVisit(v.id, st); await s.reload(); })}
              />
            ))}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
