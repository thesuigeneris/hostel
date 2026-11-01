import { DEFAULT_PLATFORM_FEE_PCT, OWNER_PLANS, rupees } from '@hostels/shared';
import { router, Stack } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, H1, H2, Notice, P, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { theme } from '@/lib/theme';

const TIERS = [
  { id: 'free', tagline: 'Get found', features: ['Listing with photos, rooms and live beds', 'Visit requests by phone and WhatsApp', 'Verified reviews from your residents', 'Issue reporting for your residents'] },
  { id: 'pro', tagline: 'Run your hostel', features: ['Everything in Free', 'Resident register with phone invites', 'Rent tracker: who paid, who is due', 'Community board with announcements'] },
  {
    id: 'partner',
    tagline: 'Join the Hostels brand',
    features: ['Everything in Pro', '“Verified partner” badge and top placement', 'Tenants subscribe and pay online, no advance', 'Weekly menus, meal skips and kitchen headcount', `Monthly payouts, ${DEFAULT_PLATFORM_FEE_PCT}% platform fee on collected rent`],
  },
] as const;

/** The website's /for-owners page, plus owner sign-up: a new number (or a tenant account) becomes an owner account. */
export default function ForOwners() {
  const { user, signIn } = useAuth();
  const isOwner = user?.role === 'owner' || user?.role === 'admin';
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.requestOtp({ phone: user?.phone ?? phone });
      setDevOtp(res.devOtp ?? null);
      if (res.devOtp) setOtp(res.devOtp);
      setStep('otp');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.auth.verifyOtp({ phone: user?.phone ?? phone, otp, role: 'owner', name: name.trim() || undefined });
      await signIn(session.token, session.user);
      router.replace('/owner/hostels/new');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'For hostel owners' }} />
      <Card tone="brand">
        <Text style={{ color: theme.colors.brand, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>For hostel and PG owners</Text>
        <H1>Fill your beds. Run your hostel from your phone.</H1>
        <P>List free today, and upgrade when you want our software or the Hostels brand. Pro and Partner are free for the first month.</P>
      </Card>

      {isOwner ? (
        <Row2>
          <Button title="List a hostel" onPress={() => router.push('/owner/hostels/new')} />
          <Button title="Go to your dashboard" variant="secondary" onPress={() => router.push('/owner')} />
        </Row2>
      ) : (
        <Card>
          <H2>{user ? 'Turn on owner tools for this account' : 'List your hostel free'}</H2>
          <P muted>{user ? `We'll text a code to +91 ${user.phone} to confirm.` : "Log in with your phone. We'll text you a 6-digit code."}</P>
          {step === 'phone' ? (
            <>
              {!user && <Field label="Mobile number" keyboardType="phone-pad" placeholder="98765 43210" value={phone} onChangeText={setPhone} maxLength={14} />}
              <ErrorText>{error}</ErrorText>
              <Button title="Send code" onPress={send} busy={busy} disabled={!user && phone.replace(/\D/g, '').length < 10} />
            </>
          ) : (
            <>
              {devOtp && <Notice>Dev mode: the code is {devOtp}.</Notice>}
              <Field label="Code" keyboardType="number-pad" value={otp} onChangeText={setOtp} maxLength={6} />
              {!user && <Field label="Your name" hint="Only needed the first time." value={name} onChangeText={setName} maxLength={80} />}
              <ErrorText>{error}</ErrorText>
              <Button title="Continue as an owner" onPress={verify} busy={busy} disabled={otp.length !== 6} />
              <Button title="Use a different number" variant="ghost" onPress={() => setStep('phone')} />
            </>
          )}
        </Card>
      )}

      {[
        ['Visibility', 'Your listing shows on search, area pages and Google, with live bed counts so tenants call when you actually have room.'],
        ['Trust', 'Reviews come only from verified residents, and your issue response time is public. Good hostels finally stand out.'],
        ['Less work', 'Rent tracking, resident lists, menus and announcements in one place instead of notebooks and WhatsApp groups.'],
      ].map(([title, text]) => (
        <View key={title} style={{ gap: 4 }}>
          <H2>{title}</H2>
          <P>{text}</P>
        </View>
      ))}

      <H2>Plans</H2>
      <P muted>Per hostel, billed monthly. Downgrade anytime. You choose your plan after your listing is created.</P>
      {TIERS.map((t) => (
        <Card key={t.id} style={t.id === 'partner' ? { borderColor: theme.colors.brand, borderWidth: 2 } : undefined}>
          <P muted>{t.tagline}</P>
          <H2>{OWNER_PLANS[t.id].label}</H2>
          <Text style={{ fontSize: 26, fontWeight: '700', color: theme.colors.text }}>
            {OWNER_PLANS[t.id].price ? rupees(OWNER_PLANS[t.id].price) : '₹0'}
            <Text style={{ fontSize: 14, fontWeight: '400', color: theme.colors.muted }}> /month</Text>
          </Text>
          {t.id === 'partner' && <P muted>+ {DEFAULT_PLATFORM_FEE_PCT}% of rent collected through us</P>}
          {t.features.map((f) => <P key={f}>✓ {f}</P>)}
        </Card>
      ))}
      <P muted>Partner hostels are checked in person by our team before the badge goes live.</P>
    </Screen>
  );
}

function Row2({ children }: { children: ReactNode }) {
  return <View style={{ gap: theme.spacing.sm }}>{children}</View>;
}
