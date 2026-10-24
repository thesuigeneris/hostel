import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NearMeButton } from '@/components/NearMe';
import { AppliedFilters, appliedFilters, type SearchParams, SearchFilters, searchHref } from '@/components/SearchFilters';
import { SearchResults } from '@/components/SearchResults';
import { SearchViewToggle } from '@/components/SearchViewToggle';
import { Flash } from '@/components/ui';
import { publicApi } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Find a hostel or PG in Hyderabad',
  description: 'Search hostels and PGs in Hyderabad by area, rent, sharing and food. See owner-reported beds, photos and reviews from residents who stayed.',
  alternates: { canonical: '/hostels' },
};

export default async function HostelsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const q = await searchParams;
  const { view: _view, ...filters } = q;
  let error: string | undefined;
  const result = await publicApi(30)
    .hostels.search(filters)
    .catch(() => {
      error = 'We could not run this search. Check the filters, or clear them and try again.';
      return { items: [], total: 0, page: Number(q.page) || 1, limit: 20 };
    });
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
      <SearchFilters q={q} action={base} />
      <AppliedFilters items={appliedFilters(q, base)} clearHref={searchHref(base, { view: q.view })} />
      <section aria-labelledby="results-heading" className="mt-6">
        <h2 id="results-heading" className="sr-only">Results</h2>
        <Flash error={error} />
        {!error && <SearchResults result={result} q={q} base={base} />}
      </section>
    </div>
  );
}
