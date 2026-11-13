import { type AuthMethods, type AuthSession, PASSWORD_MIN_LENGTH } from '@hostels/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, ErrorText, Field, H1, Loading, Notice, P, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type View_ = 'otp' | 'otp-code' | 'password' | 'signup';

export default function Login() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn } = useAuth();
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [view, setView] = useState<View_>('password');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.auth
      .methods()
      .then((m) => {
        setMethods(m);
        // Text-message code first when this server offers it, otherwise password.
        setView(m.otp !== 'off' ? 'otp' : 'password');
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function finish(session: AuthSession) {
    await signIn(session.token, session.user);
    if (router.canGoBack()) router.back();
    if (next) router.push(next as never);
  }

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    act(async () => {
      const res = await api.auth.requestOtp({ phone });
      setDevOtp(res.devOtp ?? null);
      if (res.devOtp) setOtp(res.devOtp);
      setView('otp-code');
    });
  const verify = () => act(async () => finish(await api.auth.verifyOtp({ phone, otp, name: name.trim() || undefined })));
  const logIn = () => act(async () => finish(await api.auth.login({ phone, password })));
  const signUp = () => act(async () => finish(await api.auth.register({ phone, password, name: name.trim() })));
  const demo = (p: string) => act(async () => finish(await api.auth.demo(p)));

  if (!methods) {
    return (
      <Screen>
        <H1>Log in</H1>
        {error ? <ErrorText>{error}</ErrorText> : <Loading />}
      </Screen>
    );
  }

  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const otpOn = methods.otp !== 'off';

  return (
    <Screen>
      {methods.mode === 'demo' ? (
        <>
          <H1>Try the demo</H1>
          <P>Pick an account to look around. Data resets and no real payments happen.</P>
        </>
      ) : view === 'otp' ? (
        <>
          <H1>Log in with your phone</H1>
          <P>We'll text you a 6-digit code. New here? This creates your account.</P>
          <Field label="Mobile number" keyboardType="phone-pad" autoComplete="tel" placeholder="98765 43210" value={phone} onChangeText={setPhone} autoFocus maxLength={14} />
          <ErrorText>{error}</ErrorText>
          <Button title="Send code" onPress={send} busy={busy} disabled={!phoneOk} />
          {methods.password && <Button title="Log in with a password" variant="ghost" onPress={() => setView('password')} />}
        </>
      ) : view === 'otp-code' ? (
        <>
          <H1>Enter the code</H1>
          <P>Sent to +91 {phone}.</P>
          {devOtp && <Notice>Dev mode: the code is {devOtp}.</Notice>}
          <Field label="Code" keyboardType="number-pad" autoComplete="one-time-code" value={otp} onChangeText={setOtp} maxLength={6} autoFocus />
          <Field label="Your name" hint="Only needed the first time." value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
          <ErrorText>{error}</ErrorText>
          <Button title="Log in" onPress={verify} busy={busy} disabled={otp.length !== 6} />
          <Button title="Use a different number" variant="ghost" onPress={() => setView('otp')} />
        </>
      ) : view === 'password' ? (
        <>
          <H1>Log in</H1>
          <Field label="Mobile number" keyboardType="phone-pad" autoComplete="tel" placeholder="98765 43210" value={phone} onChangeText={setPhone} maxLength={14} />
          <Field label="Password" secureTextEntry autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} maxLength={128} />
          <ErrorText>{error}</ErrorText>
          <Button title="Log in" onPress={logIn} busy={busy} disabled={!phoneOk || !password} />
          {methods.signup && <Button title="Create an account" variant="ghost" onPress={() => setView('signup')} />}
          {otpOn && <Button title="Text me a code instead" variant="ghost" onPress={() => setView('otp')} />}
        </>
      ) : (
        <>
          <H1>Create your account</H1>
          <Field label="Your name" value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
          <Field label="Mobile number" keyboardType="phone-pad" autoComplete="tel" placeholder="98765 43210" value={phone} onChangeText={setPhone} maxLength={14} />
          <Field
            label="Password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few words with spaces works well.`}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
            maxLength={128}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Create account" onPress={signUp} busy={busy} disabled={!phoneOk || !name.trim() || password.length < PASSWORD_MIN_LENGTH} />
          <Button title="I already have an account" variant="ghost" onPress={() => setView('password')} />
        </>
      )}

      {methods.demo.enabled && methods.demo.accounts.length > 0 && (
        <View style={{ gap: 8, marginTop: 16 }}>
          <P muted>Demo accounts (sample data only):</P>
          {methods.demo.accounts.map((a) => (
            <Button key={a.phone} title={`Demo ${a.role}`} variant="secondary" onPress={() => demo(a.phone)} busy={busy} />
          ))}
          {methods.mode === 'demo' && <ErrorText>{error}</ErrorText>}
        </View>
      )}
    </Screen>
  );
}
