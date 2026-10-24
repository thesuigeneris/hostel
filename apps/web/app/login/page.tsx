import type { Metadata } from 'next';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Field, Flash, Input } from '@/components/ui';
import { requestOtpAction, verifyOtpAction } from './actions';

export const metadata: Metadata = { title: 'Log in', robots: { index: false } };

type Search = { step?: string; phone?: string; next?: string; role?: string; dev?: string; error?: string };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const otpStep = q.step === 'otp' && q.phone;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">{otpStep ? 'Enter the code' : 'Log in or sign up'}</h1>
      <p className="mt-1 text-ink-soft">
        {otpStep ? `We sent a 6-digit code to +91 ${q.phone}.` : 'Use your mobile number. We will text you a one-time code.'}
      </p>
      <Card className="mt-6">
        <Flash error={q.error} />
        {otpStep ? (
          <form action={verifyOtpAction} className="space-y-4">
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
            <a href={`/login?phone=${q.phone}&next=${encodeURIComponent(q.next ?? '')}`} className="block text-center text-sm text-ink-soft">
              Use a different number
            </a>
          </form>
        ) : (
          <form action={requestOtpAction} className="space-y-4">
            <input type="hidden" name="next" value={q.next ?? ''} />
            <Field label="Mobile number">
              <div className="flex">
                <span className="grid h-10 place-items-center rounded-l-xl border border-r-0 border-line bg-bg px-3 text-sm text-ink-soft">+91</span>
                <Input name="phone" inputMode="tel" autoComplete="tel-national" required defaultValue={q.phone} className="rounded-l-none" placeholder="98765 43210" autoFocus />
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="role" value="owner" defaultChecked={q.role === 'owner'} className="h-4 w-4 accent-brand" />I own or run a hostel
            </label>
            <SubmitButton className="w-full" pendingText="Sending…">
              Send code
            </SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}
