import { dateLabel, type MyVisit } from '@hostels/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Empty, ErrorText, Field, H2, Loading, Notice, P, Row, Screen, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function Profile() {
  const { user, ready, signOut, refresh: refreshUser } = useAuth();
  const { data: visits } = useLoad<MyVisit[]>(async () => (user ? api.me.visits() : []), [user?.id]);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
  }, [user]);

  if (!ready) return <Loading />;
  if (!user) {
    return (
      <Screen>
        <Empty title="Not logged in">Log in with your phone number to subscribe, pay bills and talk to your hostel.</Empty>
        <Button title="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }

  async function save() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await api.me.update({ name: name.trim(), email: email.trim() || null });
      await refreshUser();
      setOk('Saved');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <H2>{user.name || 'Your profile'}</H2>
        <P muted>+91 {user.phone}</P>
        <Field label="Name" value={name} onChangeText={setName} maxLength={80} />
        <Field label="Email" hint="For bill receipts. Optional." value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <ErrorText>{err}</ErrorText>
        <Notice>{ok}</Notice>
        <Button title="Save" variant="secondary" onPress={save} busy={busy} disabled={!name.trim()} />
      </Card>

      <Card tone="brand">
        {user.role === 'tenant' ? <P>Own or run a hostel? List it free.</P> : <P>Run your hostel from here.</P>}
        <Button small title={user.role === 'tenant' ? 'For hostel owners' : 'Owner dashboard'} onPress={() => router.push(user.role === 'tenant' ? '/owner/join' : '/owner')} />
        {user.role === 'admin' && <Button small variant="secondary" title="Admin console" onPress={() => router.push('/admin')} />}
      </Card>

      <H2>Visit requests</H2>
      {!visits?.length ? <P muted>You haven't requested any visits.</P> : visits.map((v) => (
        <Card key={v.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '600', color: theme.colors.text }}>{v.hostel.name}</Text>
            <StatusBadge status={v.status} />
          </Row>
          <P muted>{dateLabel(v.preferredDate)}{v.message ? ` · ${v.message}` : ''}</P>
        </Card>
      ))}

      <Button title="Log out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
