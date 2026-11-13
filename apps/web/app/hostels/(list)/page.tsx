import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NearMeButton } from '@/components/NearMe';
import { AppliedFilters, appliedFilters, type SearchParams, SearchFilters, searchHref } from '@/components/SearchFilters';
import { SearchResults } from '@/components/SearchResults';
import { SearchViewToggle } from '@/components/SearchViewToggle';
import { Flash } from '@/components/ui';
import { ApiError } from '@hostels/shared';
import { publicApi, visitorApi } from '@/lib/api';
import { searchInput } from '@/lib/search';

const BASE_METADATA: Metadata = {
  title: 'Find a hostel or PG in Hyderabad',
  description: 'Search hostels and PGs in Hyderabad by area, rent, sharing and food. See owner-reported beds, photos and reviews from residents who stayed.',
  alternates: { canonical: '/hostels' },
};

/** Filtered and paged result lists are near-duplicates of the main list, so only the plain list is indexed. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const filtered = Object.entries(await searchParams).some(([k, v]) => v && k !== 'view');
  return filtered ? { ...BASE_METADATA, robots: { index: false, follow: true } } : BASE_METADATA;
}

export default async function HostelsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const q = await searchParams;
  const search = searchInput(q);
  let error: string | undefined;
  const [result, areas] = await Promise.all([
    (await visitorApi(30))
      .hostels.search(search)
      .catch((e) => {
        // Too many searches: say so and when to try again, rather than blame the filters.
        error = e instanceof ApiError && e.status === 429 ? e.message : 'We could not run this search. Check the filters, or clear them and try again.';
        return { items: [], total: 0, page: Number(q.page) || 1, limit: 20 };
      }),
    publicApi(300)
      .hostels.areas()
      .catch(() => null),
  ]);
  const base = '/hostels';
  const where = q.area ? ` in ${q.area}` : ' in Hyderabad';
  return (
    <div className="mx-auto max-w-content px-4 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {error ? `Hostels${where}` : `${result.total} ${result.total === 1 ? 'hostel' : 'hostels'}${where}`}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Rent and free beds are as reported by each hostel. Verified partners take no advance.</p>
        </div>
        <div className="flex items-start gap-2">
          <Suspense>
            <NearMeButton />
          </Suspense>
          <SearchViewToggle q={q} base={base} />
        </div>
      </div>
      <SearchFilters q={q} action={base} areas={areas} />
      <AppliedFilters items={appliedFilters(q, base)} clearHref={searchHref(base, { view: q.view })} />
      <section aria-labelledby="results-heading" className="mt-6">
        <h2 id="results-heading" className="sr-only">Results</h2>
        <Flash error={error} />
        {!error && <SearchResults result={result} q={q} base={base} search={search} />}
      </section>
    </div>
  );
}
