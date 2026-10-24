'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-ink-soft">Try again in a moment. If it keeps happening, let us know{error.digest ? ` and mention code ${error.digest}` : ''}.</p>
      <Button onClick={reset} className="mt-6">Try again</Button>
    </div>
  );
}
