import type { DeletionStatus } from '@hostels/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Card, ErrorState, ErrorText, Field, H2, Loading, P, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deleteFormProblem } from '@/lib/privacy';
import { useLoad } from '@/lib/useLoad';

/** Deleting the account (DPDP Act 2023, spec docs/superpowers/specs/2026-11-13-account-deletion-and-export.md). */
export default function DeleteAccount() {
  const { user, signOut } = useAuth();
  const { data, error, loading, reload } = useLoad<DeletionStatus>(() => api.me.deletionStatus());
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!data || !user) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;

  async function remove() {
    const problem = deleteFormProblem(confirm, password, user!.hasPassword);
    if (problem) return setErr(problem);
    setBusy(true);
    setErr(null);
    try {
      await api.me.deleteAccount({ confirm: confirm.trim(), password: password || undefined });
      await signOut();
      router.replace('/');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <P>This can't be undone. Download a copy of your data first from your profile if you want one.</P>
      <Card>
        <H2>What happens</H2>
        <P>Your name, phone number, email and password are erased, and you're signed out everywhere.</P>
        <P>Your posts, replies and likes on hostel boards, and your visit requests, are deleted.</P>
        <P>Reviews and issues you wrote stay on the hostel's record, without your name.</P>
        <P>Bills and payments are kept, without your name or number, for as long as the law requires.</P>
      </Card>
      {data.canDelete ? (
        <>
          <Field label="Type DELETE to confirm" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
          {user.hasPassword && <Field label="Your password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />}
          <ErrorText>{err}</ErrorText>
          <Button title="Delete my account" variant="danger" onPress={remove} busy={busy} disabled={busy} />
        </>
      ) : (
        <Card tone="danger">
          <H2>You can't delete your account yet</H2>
          <P>{data.reason}</P>
        </Card>
      )}
      <Button title="Keep my account" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
