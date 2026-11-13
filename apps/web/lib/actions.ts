import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { PUBLIC_DATA_TAG } from './api';
import { errorText } from './errors';

export { safePath } from './paths';

function withParam(path: string, key: string, value: string) {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.delete('error');
  params.delete('ok');
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

/**
 * Runs an API call for a form post. Errors come back to the page as `?error=`, success as `?ok=`
 * (or a redirect to `to`), so forms work without client JavaScript.
 */
export async function run<T>(back: string, fn: () => Promise<T>, opts: { ok?: string; to?: string | ((result: T) => string) } = {}): Promise<never> {
  let result: T;
  try {
    result = await fn();
  } catch (e) {
    // API answers and an unreachable API come back as plain words on the page; anything else is a real bug.
    const detail = errorText(e);
    if (detail) redirect(withParam(back, 'error', detail));
    throw e;
  }
  revalidatePath(back.split('?')[0]!);
  // Approvals, edits, subscriptions and reviews all change what public pages show.
  revalidateTag(PUBLIC_DATA_TAG);
  if (opts.to) redirect(typeof opts.to === 'function' ? opts.to(result) : opts.to);
  redirect(opts.ok ? withParam(back, 'ok', opts.ok) : back);
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export function num(form: FormData, key: string): number {
  return Number(str(form, key) || 0);
}

export function optional(form: FormData, key: string): string | undefined {
  return str(form, key) || undefined;
}
