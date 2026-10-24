import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/states';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted">No passwords. We text you a one-time code.</p>
      <Card className="mt-6 p-6">
        <Suspense fallback={<Spinner />}>
          <LoginForm />
        </Suspense>
      </Card>
    </div>
  );
}
