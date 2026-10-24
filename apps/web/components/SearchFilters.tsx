import { AREAS, GENDER_TYPES, SHARING_TYPES } from '@hostels/shared';
import { GENDER_LABEL, rupees, SHARING_LABEL } from '@/lib/format';
import { FilterDrawer } from './FilterDrawer';
import { Button, Checkbox, Field, focusRing, Input, Select } from './ui';

export type SearchParams = Record<string, string | undefined>;

/** Builds a search URL from params, dropping empty ones and the page number (a new filter starts at page 1). */
export function searchHref(base: string, q: SearchParams, changes: SearchParams = {}) {
  const merged: SearchParams = { ...q, page: undefined, ...changes };
  const params = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => !!e[1]));
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

type Applied = { key: string; label: string; href: string };

/** The filters a visitor has set, each with a link that removes just that one. Sort and view are not filters. */
export function appliedFilters(q: SearchParams, base: string, opts: { lockArea?: boolean } = {}): Applied[] {
  const without = (...keys: string[]) => searchHref(base, q, Object.fromEntries(keys.map((k) => [k, undefined])));
  const out: Applied[] = [];
  if (q.q) out.push({ key: 'q', label: `“${q.q}”`, href: without('q') });
  if (q.area && !opts.lockArea) out.push({ key: 'area', label: q.area, href: without('area') });
  if (q.sharing && q.sharing in SHARING_LABEL) out.push({ key: 'sharing', label: SHARING_LABEL[q.sharing as keyof typeof SHARING_LABEL], href: without('sharing') });
  if (q.gender && q.gender in GENDER_LABEL) out.push({ key: 'gender', label: GENDER_LABEL[q.gender as keyof typeof GENDER_LABEL], href: without('gender') });
  if (q.minRent) out.push({ key: 'minRent', label: `From ${rupees(Number(q.minRent))}`, href: without('minRent') });
  if (q.maxRent) out.push({ key: 'maxRent', label: `Up to ${rupees(Number(q.maxRent))}`, href: without('maxRent') });
  if (q.verified === 'true') out.push({ key: 'verified', label: 'Verified partners only', href: without('verified') });
  if (q.food === 'true') out.push({ key: 'food', label: 'Food available', href: without('food') });
  if (q.minRating) out.push({ key: 'minRating', label: `Rated ${q.minRating}★ or higher`, href: without('minRating') });
  if (q.lat && q.lng) {
    const sort = q.sort === 'distance' ? undefined : q.sort;
    out.push({ key: 'near', label: 'Near your location', href: searchHref(base, q, { lat: undefined, lng: undefined, radiusKm: undefined, sort }) });
  }
  return out;
}

/**
 * Applied filters as removable chips, plus "Clear all". Plain links, like the GET form: each search is a full
 * page load, which also avoids prefetching a server-rendered search page per chip.
 */
export function AppliedFilters({ items, clearHref }: { items: Applied[]; clearHref: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <h2 className="sr-only">Applied filters</h2>
      <ul className="contents">
        {items.map((f) => (
          <li key={f.key}>
            <a
              href={f.href}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-3 text-sm text-brand no-underline hover:border-brand ${focusRing}`}
            >
              <span className="sr-only">Remove filter: </span>
              {f.label}
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current"><path d="M5.3 4 10 8.7 14.7 4 16 5.3 11.3 10l4.7 4.7-1.3 1.3-4.7-4.7L5.3 16 4 14.7 8.7 10 4 5.3z" /></svg>
            </a>
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <a href={clearHref} className={`min-h-9 rounded-full px-3 text-sm leading-9 text-ink-soft hover:text-brand ${focusRing}`}>
          Clear all
        </a>
      )}
    </div>
  );
}

const DRAWER_KEYS = ['sharing', 'gender', 'minRent', 'maxRent', 'verified', 'food', 'minRating'] as const;

/**
 * One GET form. Search text and area are always visible; the rest sit inline on large screens and in a
 * bottom sheet on phones. On area pages the area comes from the URL, so it is not offered here.
 */
export function SearchFilters({ q, action = '/hostels', lockArea }: { q: SearchParams; action?: string; lockArea?: boolean }) {
  const near = !!(q.lat && q.lng);
  const count = DRAWER_KEYS.filter((k) => !!q[k]).length;
  const clearHref = searchHref(action, { view: q.view });
  return (
    <search aria-label="Filter hostels" className="block rounded-2xl border border-line bg-surface p-4 shadow-card">
      <form action={action}>
        <div className={`grid items-end gap-3 ${lockArea ? 'sm:grid-cols-[1fr_auto]' : 'sm:grid-cols-[3fr_2fr] lg:grid-cols-[3fr_2fr_auto]'}`}>
          <Field label="Search">
            <Input type="search" name="q" defaultValue={q.q} placeholder="Hostel name or street" enterKeyHint="search" />
          </Field>
          {!lockArea && (
            <Field label="Area">
              <Select name="area" defaultValue={q.area ?? ''}>
                <option value="">All areas</option>
                {AREAS.map((a) => <option key={a}>{a}</option>)}
              </Select>
            </Field>
          )}
          <div className={`flex gap-2 ${lockArea ? '' : 'sm:col-span-2 lg:col-span-1'}`}>
            <FilterDrawer count={count} clearHref={clearHref}>
              <MoreFilters q={q} near={near} />
            </FilterDrawer>
            <Button type="submit" className="flex-1 lg:flex-none lg:px-6">Search</Button>
          </div>
        </div>
        {q.lat && <input type="hidden" name="lat" value={q.lat} />}
        {q.lng && <input type="hidden" name="lng" value={q.lng} />}
        {q.radiusKm && <input type="hidden" name="radiusKm" value={q.radiusKm} />}
        {q.view && <input type="hidden" name="view" value={q.view} />}
      </form>
    </search>
  );
}

function MoreFilters({ q, near }: { q: SearchParams; near: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:mt-3 lg:grid-cols-5 lg:border-t lg:border-line lg:pt-3">
      <Field label="Sharing">
        <Select name="sharing" defaultValue={q.sharing ?? ''}>
          <option value="">Any</option>
          {SHARING_TYPES.map((s) => <option key={s} value={s}>{SHARING_LABEL[s]}</option>)}
        </Select>
      </Field>
      <Field label="For">
        <Select name="gender" defaultValue={q.gender ?? ''}>
          <option value="">Anyone</option>
          {GENDER_TYPES.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
        </Select>
      </Field>
      <Field label="Rent from (₹/month)">
        <Input name="minRent" type="number" inputMode="numeric" min={0} step={500} defaultValue={q.minRent} />
      </Field>
      <Field label="Rent up to (₹/month)">
        <Input name="maxRent" type="number" inputMode="numeric" min={0} step={500} defaultValue={q.maxRent} />
      </Field>
      <Field label="Sort by">
        <Select name="sort" defaultValue={q.sort ?? 'recommended'}>
          <option value="recommended">Recommended</option>
          <option value="rent_asc">Rent: low to high</option>
          <option value="rent_desc">Rent: high to low</option>
          <option value="rating">Rating</option>
          {/* Distance needs a location; without one the API would quietly sort by name. */}
          {near && <option value="distance">Distance from you</option>}
        </Select>
      </Field>
      <fieldset className="sm:col-span-2 lg:col-span-5">
        <legend className="sr-only">Only show</legend>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox name="verified" value="true" defaultChecked={q.verified === 'true'} label="Verified partners only (no advance)" />
          <Checkbox name="food" value="true" defaultChecked={q.food === 'true'} label="Food available" />
          <Checkbox name="minRating" value="4" defaultChecked={q.minRating === '4'} label="Rated 4★ or higher" />
        </div>
      </fieldset>
    </div>
  );
}
