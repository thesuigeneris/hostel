import { describeError } from '@/lib/errors';

/** Runs a server-side API call and returns either data or a friendly error message for an error state. */
export async function load<T>(fn: () => Promise<T>): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    return { data: null, error: describeError(e).message };
  }
}
