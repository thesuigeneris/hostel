import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { RoleGate } from '@/components/owner/Gate';
import { whileLoading } from '@/components/owner/parts';
import { Button, Card, Empty, ErrorText, Field, H2, Notice, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/ownerAction';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function AdminFoodScreen() {
  return (
    <RoleGate need="admin">
      <Stack.Screen options={{ title: 'Food partners' }} />
      <AdminFood />
    </RoleGate>
  );
}

function AdminFood() {
  const s = useLoad(() => api.admin.foodPartners());
  const a = useAction();
  const [name, setName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const gate = whileLoading(s);
  if (gate) return gate;
  const partners = s.data!;

  return (
    <Screen refreshing={s.refreshing} onRefresh={s.refresh}>
      <P muted>Cloud kitchens partner hostels can pick for a meal on their menu.</P>
      <ErrorText>{a.error ?? s.error}</ErrorText>
      <Notice>{a.ok}</Notice>
      <Card>
        <H2>Add a food partner</H2>
        <Field label="Name" value={name} onChangeText={setName} maxLength={80} />
        <Field label="Cuisine" value={cuisine} onChangeText={setCuisine} maxLength={80} placeholder="Andhra meals" />
        <Field label="Logo URL" value={logoUrl} onChangeText={setLogoUrl} autoCapitalize="none" keyboardType="url" maxLength={500} />
        <Button
          title="Add"
          disabled={name.trim().length < 2}
          busy={a.busy === 'add'}
          onPress={() => a.run('add', async () => {
            await api.admin.addFoodPartner({ name: name.trim(), cuisine: cuisine.trim(), logoUrl: logoUrl.trim() || null });
            setName('');
            setCuisine('');
            setLogoUrl('');
            await s.reload();
          }, 'Food partner added')}
        />
      </Card>
      {partners.length === 0 ? <Empty title="No food partners yet" /> : partners.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '600', color: theme.colors.text, flex: 1 }}>{p.name}</Text>
            <StatusBadge status={p.active ? 'active' : 'ended'} />
          </Row>
          {p.cuisine ? <P muted>{p.cuisine}</P> : null}
          <Button
            small
            variant="secondary"
            title={p.active ? 'Deactivate' : 'Activate'}
            busy={a.busy === p.id}
            onPress={() => a.run(p.id, async () => {
              const next = await api.admin.updateFoodPartner(p.id, { active: !p.active });
              s.setData(partners.map((x) => (x.id === p.id ? next : x)));
            })}
          />
        </Card>
      ))}
    </Screen>
  );
}
