import { notFound } from 'next/navigation';
import { ApiRequestError } from '@hostels/shared';

export type Loaded<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };

/** Await an API call in a Server Component without throwing. 404 can optionally trigger notFound(). */
export async function load<T>(p: Promise<T>, opts: { notFoundOn404?: boolean } = {}): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    if (e instanceof ApiRequestError) {
      if (opts.notFoundOn404 && e.status === 404) notFound();
      return { ok: false, status: e.status, code: e.code, message: e.message };
    }
    return { ok: false, status: 0, code: 'unreachable', message: 'We could not reach the server. Please try again shortly.' };
  }
}
