// Pure helpers for the search box's suggestion list (components/SearchSuggest.tsx), kept apart so they can be tested.

/** The option after moving `step` from `current` in a list of `count`, wrapping at both ends; -1 when the list is empty. */
export function moveActive(current: number, count: number, step: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return step === 1 ? 0 : count - 1;
  return (current + step + count) % count;
}

/**
 * The rest of the search form, as a query string, so picking an area keeps the filters already chosen. The text and
 * the area are replaced by the pick, the page starts again at 1, and the default sort adds nothing.
 */
export function keepParams(entries: Iterable<[string, FormDataEntryValue]>): string {
  const out = new URLSearchParams();
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || !value || key === 'q' || key === 'area' || key === 'page') continue;
    if (key === 'sort' && value === 'recommended') continue;
    out.append(key, value);
  }
  return out.toString();
}

/** What a screen reader hears when the list changes. */
export function suggestionStatus(count: number): string {
  if (count === 0) return 'No areas or hostels match yet. Press Enter to search all listings.';
  return `${count} ${count === 1 ? 'suggestion' : 'suggestions'}. Use the up and down arrows to choose, then Enter.`;
}
