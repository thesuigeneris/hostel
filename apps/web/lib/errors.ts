import { ApiError } from '@hostels/shared';

/** What a form shows when the API can't be reached at all (fetch fails before any answer). */
export const UNREACHABLE = 'We couldn’t reach the server. Check your connection and try again in a minute.';

/** A field path as people read it: `preferredDate` → "Preferred date", `items.0.vegDish` → "Veg dish". */
export function fieldLabel(path: string): string {
  const last = path.split('.').filter((p) => !/^\d+$/.test(p)).pop() ?? '';
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/**
 * The words a form shows for a failed API call: each field problem as "Field: problem", or the API's message.
 * Null for anything that isn't an API answer or a network failure, which should surface as a real error.
 */
export function errorText(e: unknown): string | null {
  if (e instanceof ApiError) {
    if (!e.issues?.length) return e.message;
    return e.issues.map((i) => (fieldLabel(i.path) ? `${fieldLabel(i.path)}: ${i.message}` : i.message)).join('; ');
  }
  // fetch() rejects with a TypeError when it gets no answer at all.
  if (e instanceof TypeError) return UNREACHABLE;
  return null;
}
