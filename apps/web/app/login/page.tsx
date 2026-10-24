import { type AuthMethods, createApiClient, PASSWORD_MIN_LENGTH } from '@hostels/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Field, Flash, Input } from '@/components/ui';
import { API_URL } from '@/lib/api';
import { demoLoginAction, passwordLoginAction, registerAction, requestOtpAction, verifyOtpAction } from './actions';

export const metadata: Metadata = { title: 'Log in', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Search = { step?: string; view?: string; phone?: string; name?: string; next?: string; role?: string; dev?: string; error?: string };

const OFF: AuthMethods = { mode: 'standard', otp: 'off', password: true, signup: true, demo: { enabled: false, accounts: [] } };

function PhoneInput({ defaultValue, autoFocus }: { defaultValue?: string; autoFocus?: boolean }) {
  return (
    <div className="flex">
      <span className="grid h-10 place-items-center rounded-l-xl border border-r-0 border-line bg-bg px-3 text-sm text-ink-soft">+91</span>
      <Input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required defaultValue={defaultValue} className="rounded-l-none" placeholder="98765 43210" autoFocus={autoFocus} />
    </div>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const methods = await createApiClient(API_URL)
    .auth.methods()
    .catch(() => OFF);
  const otpOn = methods.otp !== 'off';
  const otpStep = otpOn && q.step === 'otp' && q.phone;
  // OTP first when it exists (SMS or dev), otherwise password, so people see a method that works here.
  const view = otpStep ? 'otp-code' : q.view === 'signup' || q.view === 'password' || q.view === 'otp' ? q.view : otpOn ? 'otp' : 'password';
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ next: q.next, role: q.role, ...extra }).filter((e): e is [string, string] => !!e[1]));
    return `/login?${p.toString()}`;
  };

  const heading =
    methods.mode === 'demo'
      ? 'Try the demo'
      : view === 'otp-code'
        ? 'Enter the code'
        : view === 'signup'
          ? 'Create your account'
          : 'Log in or sign up';

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">{heading}</h1>
      {methods.mode === 'demo' && (
        <p className="mt-1 text-ink-soft">This is a demo. Pick an account to look around. Data resets and no real payments happen.</p>
      )}
      <Card className="mt-6">
        <Flash error={q.error} />

        {methods.mode === 'standard' && view === 'otp-code' && (
          <form action={verifyOtpAction} className="space-y-4">
            <p className="text-sm text-ink-soft">We sent a 6-digit code to +91 {q.phone}.</p>
            <input type="hidden" name="phone" value={q.phone} />
            <input type="hidden" name="next" value={q.next ?? ''} />
            <input type="hidden" name="role" value={q.role ?? ''} />
            <Field label="One-time code" hint={q.dev ? `Dev mode: the code is ${q.dev}` : undefined}>
              <Input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus defaultValue={q.dev ?? ''} />
            </Field>
            <Field label="Your name" hint="New here? We'll use this on your account.">
              <Input name="name" autoComplete="name" maxLength={80} />
            </Field>
            <SubmitButton className="w-full" pendingText="Checking…">
              Verify and continue
            </SubmitButton>
            <Link href={keep({ view: 'otp', phone: q.phone })} className="block text-center text-sm text-ink-soft">
              Use a different number
            </Link>
          </form>
        )}

        {methods.mode === 'standard' && view === 'otp' && (
          <form action={requestOtpAction} className="space-y-4">
            <input type="hidden" name="next" value={q.next ?? ''} />
            <Field label="Mobile number">
              <PhoneInput defaultValue={q.phone} autoFocus />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="role" value="owner" defaultChecked={q.role === 'owner'} className="h-4 w-4 accent-brand" />I own or run a hostel
            </label>
            <SubmitButton className="w-full" pendingText="Sending…">
              Send code
            </SubmitButton>
            {methods.password && (
              <p className="text-center text-sm text-ink-soft">
                <Link href={keep({ view: 'password', phone: q.phone })}>Log in with a password</Link>
              </p>
            )}
          </form>
        )}

        {methods.mode === 'standard' && view === 'password' && methods.password && (
          <form action={passwordLoginAction} className="space-y-4">
            <input type="hidden" name="next" value={q.next ?? ''} />
            <Field label="Mobile number">
              <PhoneInput defaultValue={q.phone} autoFocus={!q.phone} />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required maxLength={128} autoFocus={!!q.phone} />
            </Field>
            <SubmitButton className="w-full" pendingText="Logging in…">
              Log in
            </SubmitButton>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              {methods.signup && <Link href={keep({ view: 'signup', phone: q.phone })}>Create an account</Link>}
              {otpOn && <Link href={keep({ view: 'otp', phone: q.phone })}>Text me a code instead</Link>}
            </div>
            <p className="text-xs text-ink-muted">Forgot your password? Log in with a text-message code if it&apos;s offered, or ask the hostel team to reset it.</p>
          </form>
        )}

        {methods.mode === 'standard' && view === 'signup' && methods.signup && (
          <form action={registerAction} className="space-y-4">
            <input type="hidden" name="next" value={q.next ?? ''} />
            <Field label="Your name">
              <Input name="name" autoComplete="name" required maxLength={80} defaultValue={q.name} autoFocus />
            </Field>
            <Field label="Mobile number">
              <PhoneInput defaultValue={q.phone} />
            </Field>
            <Field label="Password" hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few words with spaces works well, like "mango tree by the gate".`}>
              <Input name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={128} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="role" value="owner" defaultChecked={q.role === 'owner'} className="h-4 w-4 accent-brand" />I own or run a hostel
            </label>
            <SubmitButton className="w-full" pendingText="Creating…">
              Create account
            </SubmitButton>
            <p className="text-center text-sm text-ink-soft">
              Already have an account? <Link href={keep({ view: 'password', phone: q.phone })}>Log in</Link>
            </p>
          </form>
        )}

        {methods.demo.enabled && methods.demo.accounts.length > 0 && (
          <div className={methods.mode === 'demo' ? '' : 'mt-6 border-t border-line pt-4'}>
            <h2 className="text-sm font-semibold">Try a demo account</h2>
            <p className="mt-1 text-xs text-ink-muted">Sample data only. Demo accounts are never available on the live site.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {methods.demo.accounts.map((a) => (
                <form key={a.phone} action={demoLoginAction}>
                  <input type="hidden" name="demoPhone" value={a.phone} />
                  <input type="hidden" name="next" value={q.next ?? ''} />
                  <SubmitButton variant="secondary" size="sm" className="w-full" pendingText="Opening…">
                    {`Demo ${a.role}`}
                  </SubmitButton>
                </form>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
