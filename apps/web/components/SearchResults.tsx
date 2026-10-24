import type { SearchResult } from '@hostels/shared';
import Link from 'next/link';
import { rupees } from '@/lib/format';
import { HostelCard } from './HostelCard';
import { ClientHostelMap } from './MapLoader';
import { AppliedFilters, appliedFilters, type SearchParams, searchHref } from './SearchFilters';
import { buttonClass, Empty, Pagination } from './ui';

/**
 * Results for a search. `q` holds the params as they appear in this page's URL (on area pages, without
 * the area, which comes from the path).
 */
export function SearchResults({ result, q, base, lockArea }: { result: SearchResult; q: SearchParams; base: string; lockArea?: boolean }) {
  const applied = appliedFilters(q, base, { lockArea });
  const clearHref = searchHref(base, { view: q.view });
  const page = result.page;

  if (!result.items.length) {
    // The API counts the rows on the page it returns, so past the last page the total reads as 0.
    if (page > 1) {
      return (
        <Empty title={`Nothing on page ${page}`} action={<a href={searchHref(base, q)} className={buttonClass('secondary')}>Go to page 1</a>}>
          The results for this search end before this page.
        </Empty>
      );
    }
    const inverted = q.minRent && q.maxRent && Number(q.minRent) > Number(q.maxRent);
    return (
      <Empty
        title="No hostels match these filters"
        action={applied.length ? <a href={clearHref} className={buttonClass('secondary')}>Clear all filters</a> : undefined}
      >
        {inverted ? (
          <p>“Rent from” is higher than “Rent up to”. Swap them, or remove one.</p>
        ) : applied.length ? (
          <p>Remove a filter to see more. Each one below removes just that filter.</p>
        ) : (
          <p>There are no live listings here yet.</p>
        )}
        {applied.length > 0 && (
          <div className="flex justify-center">
            <AppliedFilters items={applied} clearHref={clearHref} />
          </div>
        )}
      </Empty>
    );
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
