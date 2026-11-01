import type { SearchInput, SearchResult } from '@hostels/shared';
import Link from 'next/link';
import { publicApi } from '@/lib/api';
import { rupees } from '@/lib/format';
import { HostelCard } from './HostelCard';
import { ClientHostelMap } from './MapLoader';
import { AppliedFilters, appliedFilters, type SearchParams, searchHref } from './SearchFilters';
import { buttonClass, Empty, focusRing, Pagination } from './ui';

/**
 * Results for a search. `q` holds the params as they appear in this page's URL (on area pages, without the area,
 * which comes from the path); `search` is exactly what was sent to the API, so the no-results state can count what
 * each relaxed search would find.
 */
export async function SearchResults({
  result,
  q,
  base,
  lockArea,
  search,
}: {
  result: SearchResult;
  q: SearchParams;
  base: string;
  lockArea?: boolean;
  search: SearchInput;
}) {
  const page = result.page;

  if (!result.items.length) {
    // Past the last page: the API still counts the matches, so point to where they end.
    if (page > 1 && result.total > 0) {
      const last = Math.ceil(result.total / result.limit);
      return (
        <Empty
          title={`Nothing on page ${page}`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <a href={searchHref(base, q, { page: last > 1 ? String(last) : undefined })} className={buttonClass('primary')}>
                Go to the last page ({last})
              </a>
              <a href={searchHref(base, q)} className={buttonClass('secondary')}>Go to page 1</a>
            </div>
          }
        >
          These results end at page {last}: {result.total} {result.total === 1 ? 'hostel matches' : 'hostels match'}.
        </Empty>
      );
    }
    return <NoResults q={q} base={base} lockArea={lockArea} search={search} />;
  }

  const pages = Math.ceil(result.total / result.limit);
  const from = (page - 1) * result.limit + 1;
  const to = from + result.items.length - 1;
  return (
    <>
      <p className="mb-4 text-sm text-ink-soft">
        {pages > 1 ? `Showing ${from}–${to} of ${result.total}` : `${result.total} ${result.total === 1 ? 'result' : 'results'}`}
        {q.sort === 'distance' && ', nearest first'}
      </p>
      {q.view === 'map' ? (
        <>
          <ClientHostelMap
            height={520}
            points={result.items.map((h) => ({
              id: h.id,
              lat: h.lat,
              lng: h.lng,
              label: h.name,
              href: `/hostels/${h.slug}`,
              verified: h.isVerified,
              sub: h.minRent ? `from ${rupees(h.minRent)}/month` : undefined,
            }))}
          />
          {/* The same results as a list, for keyboard and screen-reader users and anyone who finds maps hard. */}
          <h3 className="mt-6 text-sm font-semibold text-ink">Hostels on this map</h3>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 border-b border-line py-2">
                <Link href={`/hostels/${h.slug}`} className="min-w-0 truncate font-medium">{h.name}</Link>
                <span className="shrink-0 tabular-nums text-ink-soft">{rupees(h.minRent)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((h) => (
            <li key={h.id} className="flex">
              <HostelCard h={h} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pages={pages} href={(p) => searchHref(base, q, { page: p > 1 ? String(p) : undefined })} />
    </>
  );
}

/** API params each applied filter adds, so a relaxed search can drop exactly those. */
const FILTER_PARAMS: Record<string, string[]> = { near: ['lat', 'lng', 'radiusKm'] };

type Relaxation = { key: string; label: string; href: string; count: number };

/**
 * Nothing matched. Instead of a dead end, count what each single change would find (drop one filter, or on an area
 * page, look in every area) and offer the ones that find something, most results first.
 */
async function NoResults({ q, base, lockArea, search }: { q: SearchParams; base: string; lockArea?: boolean; search: SearchInput }) {
  const applied = appliedFilters(q, base, { lockArea });
  const clearHref = searchHref(base, { view: q.view });
  const inverted = q.minRent && q.maxRent && Number(q.minRent) > Number(q.maxRent);
  const api = publicApi(60);
  const count = (input: SearchInput) =>
    api.hostels
      .search({ ...input, page: undefined, limit: 1 })
      .then((r) => r.total)
      .catch(() => 0);
  const without = (keys: string[]): SearchInput => {
    // The client leaves undefined params out of the query.
    const next: Record<string, unknown> = { ...search };
    for (const k of keys) next[k] = undefined;
    // Distance needs a location, so dropping "near me" also drops the distance sort.
    if (keys.includes('lat') && next.sort === 'distance') next.sort = undefined;
    return next as SearchInput;
  };

  const tries = applied.map((f) => ({ key: f.key, label: `Remove ${f.label}`, href: f.href, input: without(FILTER_PARAMS[f.key] ?? [f.key]) }));
  if (lockArea && search.area) {
    tries.push({ key: 'every-area', label: 'Look in every area', href: searchHref('/hostels', q), input: without(['area']) });
  }
  const counted: Relaxation[] = (await Promise.all(tries.map(async (t) => ({ ...t, count: await count(t.input) })))).filter((t) => t.count > 0);
  counted.sort((a, b) => b.count - a.count);
  const clearCount = applied.length > 1 && !counted.length ? await count(without(applied.flatMap((f) => FILTER_PARAMS[f.key] ?? [f.key]))) : 0;

  return (
    <Empty
      title="No hostels match these filters"
      action={applied.length ? <a href={clearHref} className={buttonClass('secondary')}>Clear all filters</a> : undefined}
    >
      {inverted ? (
        <p>“Rent from” is higher than “Rent up to”. Swap them, or remove one.</p>
      ) : counted.length ? (
        <p>Each of these changes finds hostels:</p>
      ) : applied.length > 1 && clearCount > 0 ? (
        <p>No single change finds a match. Clearing every filter shows {clearCount} {clearCount === 1 ? 'hostel' : 'hostels'}.</p>
      ) : applied.length ? (
        <p>Remove a filter to see more. Each one below removes just that filter.</p>
      ) : (
        <p>There are no live listings here yet.</p>
      )}
      {counted.length > 0 && (
        <ul aria-label="Ways to widen this search" className="mt-3 flex flex-wrap justify-center gap-2">
          {counted.map((t) => (
            <li key={t.key}>
              <a
                href={t.href}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-3 text-sm text-brand no-underline hover:border-brand ${focusRing}`}
              >
                {t.label}{' '}
                <span className="text-ink-soft">
                  · {t.count} {t.count === 1 ? 'hostel' : 'hostels'}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {!counted.length && applied.length > 0 && (
        <div className="flex justify-center">
          <AppliedFilters items={applied} clearHref={clearHref} />
        </div>
      )}
    </Empty>
  );
}
