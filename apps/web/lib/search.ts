import { AREAS, SEARCH_TEXT_MAX, type SearchInput } from '@hostels/shared';

type Params = Record<string, string | undefined>;

/**
 * The API search for a page's URL params. `view` (list or map) is the page's own; search text longer than the API
 * accepts is cut to the limit rather than failing the whole search (the box itself stops at the limit too).
 */
export function searchInput(params: Params, area?: string): SearchInput {
  const { view: _view, ...rest } = params;
  const out: Params = { ...rest };
  if (out.q) out.q = out.q.trim().slice(0, SEARCH_TEXT_MAX);
  // A hand-edited page or page size outside what the API serves is brought into range instead of failing.
  out.page = clampInt(out.page, 1, MAX_PAGE);
  out.limit = clampInt(out.limit, 1, MAX_LIMIT);
  if (area) out.area = area;
  return out as SearchInput;
}

/** The API serves pages 1–100 of 1–50 results. */
const MAX_PAGE = 100;
const MAX_LIMIT = 50;

function clampInt(value: string | undefined, min: number, max: number): string | undefined {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? String(Math.min(max, Math.max(min, n))) : undefined;
}

/**
 * Areas for the area picker: the ones with live hostels (from the API), or the launch list when the API is down.
 * An area already in the URL stays selectable even if it has no listings left, so resubmitting never drops it.
 */
export function areaOptions(live: { area: string }[] | null, current?: string): string[] {
  const names = live?.length ? live.map((a) => a.area) : [...AREAS];
  return current && !names.some((n) => n.toLowerCase() === current.toLowerCase()) ? [...names, current] : names;
}

/** The option matching the URL's area whatever its case (the API matches areas case-insensitively). */
export function areaValue(options: string[], current?: string): string {
  return current ? (options.find((o) => o.toLowerCase() === current.toLowerCase()) ?? current) : '';
}
