'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { describeError } from '@/lib/errors';

/**
 * Wraps an async mutation: tracks which action is pending and its errors, and refreshes
 * the server-rendered page on success so lists re-fetch.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function run<T>(key: string, fn: () => Promise<T>, opts: { refresh?: boolean } = {}): Promise<T | undefined> {
    setPending(key);
    setError(null);
    setFields({});
    try {
      const out = await fn();
      if (opts.refresh !== false) router.refresh();
      return out;
    } catch (e) {
      const d = describeError(e);
      setError(d.message);
      setFields(d.fields);
      return undefined;
    } finally {
      setPending(null);
    }
  }

  return { run, pending, error, fields, setError };
}
