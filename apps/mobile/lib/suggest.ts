import { SEARCH_TEXT_MAX, SUGGEST_MIN_CHARS, type Suggestion } from '@hostels/shared';
import type { Filters } from './search';

/** How long typing must pause before suggestions are fetched. */
export const SUGGEST_DEBOUNCE_MS = 250;

/** The text to look up, or null while it is too short to suggest anything useful. */
export function suggestQuery(text: string): string | null {
  const q = text.trim().replace(/\s+/g, ' ').slice(0, SEARCH_TEXT_MAX);
  return q.length >= SUGGEST_MIN_CHARS ? q : null;
}

/**
 * Hands out a number per request and says whether an answer is still the newest one, so a slow answer for old
 * text (or an old filter) never replaces a newer one.
 */
export function latestOnly() {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (n: number) => n === current,
  };
}

/** What picking a suggestion does on Explore: an area becomes the area filter (the text is cleared); a hostel opens. */
export function applySuggestion(s: Suggestion, filters: Filters): { filters: Filters } | { open: string } {
  if (s.kind === 'hostel') return { open: `/hostel/${s.slug}` };
  return { filters: { ...filters, area: s.label, q: '' } };
}
