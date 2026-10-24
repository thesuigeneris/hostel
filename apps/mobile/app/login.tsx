import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorText, Field, H1, Notice, P, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
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
      const session = await api.auth.verifyOtp({ phone, otp, name: name.trim() || undefined });
      await signIn(session.token, session.user);
      if (router.canGoBack()) router.back();
      if (next) router.push(next as never);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>{step === 'phone' ? 'Log in with your phone' : 'Enter the code'}</H1>
      {step === 'phone' ? (
        <>
          <P>We'll text you a 6-digit code. New here? This creates your account.</P>
          <Field label="Mobile number" keyboardType="phone-pad" placeholder="98765 43210" value={phone} onChangeText={setPhone} autoFocus maxLength={14} />
          <ErrorText>{error}</ErrorText>
          <Button title="Send code" onPress={send} busy={busy} disabled={phone.replace(/\D/g, '').length < 10} />
        </>
      ) : (
        <>
          <P>Sent to +91 {phone}.</P>
          {devOtp && <Notice>Dev mode: the code is {devOtp}.</Notice>}
          <Field label="Code" keyboardType="number-pad" value={otp} onChangeText={setOtp} maxLength={6} autoFocus />
          <Field label="Your name" hint="Only needed the first time." value={name} onChangeText={setName} maxLength={80} />
          <ErrorText>{error}</ErrorText>
          <Button title="Log in" onPress={verify} busy={busy} disabled={otp.length !== 6} />
          <Button title="Use a different number" variant="ghost" onPress={() => setStep('phone')} />
        </>
      )}
    </Screen>
  );
}
