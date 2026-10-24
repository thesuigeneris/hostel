import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, ErrorText, Field, H1, Notice, P, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { theme } from '@/lib/theme';

export default function Login() {
  const params = useLocalSearchParams<{ next?: string; role?: string }>();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [owner, setOwner] = useState(params.role === 'owner');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.requestOtp({ phone });
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
      // The role only applies when this phone signs up for the first time; existing accounts keep theirs.
      const session = await api.auth.verifyOtp({ phone, otp, name: name.trim() || undefined, role: owner ? 'owner' : undefined });
      await signIn(session.token, session.user);
      if (router.canGoBack()) router.back();
      const next = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : null;
      if (next) router.push(next as never);
      else if (session.user.role !== 'tenant') router.navigate('/profile');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>{step === 'phone' ? 'Log in or sign up' : 'Enter the code'}</H1>
      {step === 'phone' ? (
        <>
          <P>Use your mobile number. We'll text you a 6-digit code. New here? This creates your account.</P>
          <Field label="Mobile number (+91)" keyboardType="phone-pad" placeholder="98765 43210" value={phone} onChangeText={setPhone} autoFocus maxLength={14} autoComplete="tel" />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: owner }}
            onPress={() => setOwner(!owner)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: owner ? theme.colors.brand : theme.colors.border, backgroundColor: owner ? theme.colors.brand : theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              {owner && <Text style={{ color: theme.colors.white, fontWeight: '700', fontSize: 13 }}>✓</Text>}
            </View>
            <Text style={{ color: theme.colors.soft, fontSize: 15 }}>I own or run a hostel</Text>
          </Pressable>
          <ErrorText>{error}</ErrorText>
          <Button title="Send code" onPress={send} busy={busy} disabled={phone.replace(/\D/g, '').length < 10} />
        </>
      ) : (
        <>
          <P>Sent to +91 {phone}.</P>
          {devOtp && <Notice>Dev mode: the code is {devOtp}.</Notice>}
          <Field label="One-time code" keyboardType="number-pad" value={otp} onChangeText={setOtp} maxLength={6} autoFocus autoComplete="sms-otp" textContentType="oneTimeCode" />
          <Field label="Your name" hint="New here? We'll use this on your account." value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
          <ErrorText>{error}</ErrorText>
          <Button title="Verify and continue" onPress={verify} busy={busy} disabled={otp.length !== 6} />
          <Button title="Use a different number" variant="ghost" onPress={() => { setStep('phone'); setOtp(''); setError(null); }} />
        </>
      )}
    </Screen>
  );
}
