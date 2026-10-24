'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { User } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Field, FormError, Input } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';

/** Only same-site relative paths are allowed as a post-login redirect. */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [owner, setOwner] = useState(params.get('role') === 'owner' || (next?.startsWith('/owner') ?? false));
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  async function sendOtp() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.auth.requestOtp({ phone });
      setDevOtp(r.devOtp ?? null);
      setStep('otp');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, role: owner ? 'owner' : 'tenant', ...(name.trim() ? { name: name.trim() } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fields: Record<string, string> = {};
        for (const i of data.issues ?? []) fields[i.path] = i.message;
        setError({ message: data.message ?? 'Could not sign in', fields });
        return;
      }
      const user = data.user as User;
      const dest = next ?? (user.role === 'owner' ? '/owner' : user.role === 'admin' ? '/admin' : '/account');
      router.push(dest);
      router.refresh();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }

  const generalError = error && Object.keys(error.fields).length === 0 ? error.message : null;

  return step === 'phone' ? (
    <form
      key="phone"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void sendOtp();
      }}
    >
      <Field label="Mobile number" error={error?.fields.phone} hint="We'll send a 6-digit code by SMS.">
        <div className="flex">
          <span className="inline-flex items-center rounded-l-xl border border-r-0 border-line bg-bg px-3 text-sm text-muted">+91</span>
          <Input
            className="rounded-l-none"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoFocus
          />
        </div>
      </Field>
      <label className="flex items-start gap-3 rounded-xl border border-line bg-bg p-3 text-sm">
        <input type="checkbox" checked={owner} onChange={(e) => setOwner(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
        <span>
          <span className="font-medium">I own or manage a hostel</span>
          <span className="block text-muted">List your hostel and manage residents from the owner dashboard.</span>
        </span>
      </label>
      <FormError message={generalError} />
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Send code
      </Button>
    </form>
  ) : (
    <form
      key="otp"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      <p className="text-sm text-muted">
        Enter the code sent to +91 {phone}.{' '}
        <button type="button" className="text-brand underline" onClick={() => { setStep('phone'); setOtp(''); setError(null); }}>
          Change number
        </button>
      </p>
      {devOtp && <p className="rounded-xl bg-food-soft px-3 py-2 text-sm text-food">Dev mode: your code is <strong>{devOtp}</strong></p>}
      <Field label="6-digit code" error={error?.fields.otp}>
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required autoFocus className="text-center text-lg tracking-[0.5em]" />
      </Field>
      <Field label="Your name" hint="Only needed the first time. Other residents see your name, never your number." error={error?.fields.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
      </Field>
      <FormError message={generalError} />
      <Button type="submit" size="lg" className="w-full" loading={loading} disabled={otp.length !== 6}>
        Verify and sign in
      </Button>
      <button type="button" className="w-full text-sm text-muted underline" onClick={() => void sendOtp()} disabled={loading}>
        Resend code
      </button>
    </form>
  );
}
