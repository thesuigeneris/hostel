import { type SearchParams, searchHref } from './SearchFilters';
import { cx, focusRing } from './ui';

/** List or map: plain links (see AppliedFilters), so the choice is in the URL and survives sharing and reloads. */
export function SearchViewToggle({ q, base }: { q: SearchParams; base: string }) {
  const map = q.view === 'map';
  const item = (on: boolean) =>
    cx('grid h-9 place-items-center rounded-lg px-3 text-sm font-medium no-underline transition duration-feedback', focusRing, on ? 'bg-brand text-brand-on' : 'text-ink-soft hover:text-brand');
  return (
    <nav aria-label="Results view" className="inline-flex rounded-xl border border-line bg-surface p-1">
      <a href={searchHref(base, q, { view: undefined, page: q.page })} aria-current={map ? undefined : 'true'} className={item(!map)}>List</a>
      <a href={searchHref(base, q, { view: 'map', page: q.page })} aria-current={map ? 'true' : undefined} className={item(map)}>Map</a>
    </nav>
  );
}
