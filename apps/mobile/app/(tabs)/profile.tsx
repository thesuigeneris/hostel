import { dateLabel, istDate, type MyVisit, titleCase, VISIT_STATUS_LABEL, visitNextStep } from '@hostels/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text } from 'react-native';
import { Badge, Button, Card, Empty, ErrorText, Field, H2, Loading, Notice, P, Row, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

export default function Profile() {
  const { user, ready, signOut, refresh: refreshUser } = useAuth();
  const { data: visits, error: visitsError, reload: reloadVisits, setData: setVisits } = useLoad<MyVisit[]>(async () => (user ? api.me.visits() : []), [user?.id]);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [visitMsg, setVisitMsg] = useState<{ ok?: string; error?: string }>({});
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

  const today = istDate();
  const withdraw = (v: MyVisit) =>
    confirm('Withdraw this visit request?', `${v.hostel.name} won't call you about it.`, async () => {
      setWithdrawing(v.id);
      setVisitMsg({});
      try {
        const updated = await api.me.cancelVisit(v.id);
        setVisits((visits ?? []).map((x) => (x.id === v.id ? { ...x, ...updated } : x)));
        setVisitMsg({ ok: 'Visit request withdrawn.' });
      } catch (e) {
        // The hostel may have answered meanwhile; show where things stand now.
        setVisitMsg({ error: errorMessage(e) });
        reloadVisits();
      } finally {
        setWithdrawing(null);
      }
    }, 'Withdraw');

  return (
    <Screen>
      <Card>
        <H2>{user.name || 'Your profile'}</H2>
        <P muted>+91 {user.phone}{user.phoneVerified ? ' · verified' : ' · not verified yet'}</P>
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
      <ErrorText>{visitMsg.error ?? (visits ? null : visitsError)}</ErrorText>
      <Notice>{visitMsg.ok}</Notice>
      {!visits?.length ? <P muted>{visits ? "You haven't requested any visits." : ' '}</P> : visits.map((v) => (
        <Card key={v.id}>
          <Pressable accessibilityRole="link" accessibilityLabel={`${v.hostel.name}, ${VISIT_STATUS_LABEL[v.status]}`} onPress={() => router.push(`/hostel/${v.hostel.slug}`)} style={{ gap: theme.spacing.xs }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text, flexShrink: 1 }}>{v.hostel.name}</Text>
              <Badge label={VISIT_STATUS_LABEL[v.status]} tone={v.status === 'new' ? 'food' : v.status === 'contacted' ? 'green' : 'gray'} />
            </Row>
            <P muted>{dateLabel(v.preferredDate)}{v.message ? ` · ${v.message}` : ''}</P>
            <P>{visitNextStep(v, today)}</P>
          </Pressable>
          {v.status === 'new' && (
            <Button small variant="secondary" title="Withdraw" busy={withdrawing === v.id} onPress={() => withdraw(v)} />
          )}
        </Card>
      ))}

      <P muted>Signed in as {titleCase(user.role)}.</P>
      <Button title="Log out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
