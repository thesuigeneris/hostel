import type { Metadata } from 'next';
import { Suspense } from 'react';
import { createApiClient, schemas, type HostelSearchQuery } from '@hostels/shared';
import { LoadError } from '@/components/public/load-error';
import { Pagination } from '@/components/public/pagination';
import { ResultsView } from '@/components/public/results-view';
import { load } from '@/components/public/safe';
import { SearchFilters } from '@/components/public/search-filters';
import { EmptyState } from '@/components/ui/states';
import { ButtonLink } from '@/components/ui/button';
import { API_URL } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Search hostels and PGs',
  description: 'Filter hostels and PGs in Hyderabad by area, rent, sharing, food and verified partners.',
};

const PAGE_SIZE = 12;

type Search = Record<string, string | string[] | undefined>;

function flatten(sp: Search): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = flatten(await searchParams);
  const parsed = schemas.hostelSearchQuery.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v)));
  const query: HostelSearchQuery = { ...(parsed.success ? parsed.data : {}), pageSize: PAGE_SIZE };

  const api = createApiClient(API_URL);
  const [results, areas] = await Promise.all([load(api.hostels.search(query)), load(api.areas())]);
  const areaNames = areas.ok ? [...new Set(areas.data.map((a) => a.area))].sort() : [];

  const heading = query.q ? `Hostels matching “${query.q}”` : query.area ? `Hostels in ${query.area}` : query.lat ? 'Hostels near you' : 'All hostels';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h1>
      <div className="mt-4">
        <Suspense>
          <SearchFilters areas={areaNames} />
        </Suspense>
      </div>
      <div className="mt-6">
        {!results.ok ? (
          <LoadError message={results.message} retryHref="/search" />
        ) : results.data.items.length === 0 ? (
          <EmptyState title="No hostels match these filters" action={<ButtonLink href="/search" variant="secondary">Clear filters</ButtonLink>}>
            Try a wider rent range or a nearby area.
          </EmptyState>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              {results.data.total} {results.data.total === 1 ? 'hostel' : 'hostels'}
            </p>
            <ResultsView items={results.data.items} />
            <Pagination page={results.data.page} pageSize={results.data.pageSize} total={results.data.total} basePath="/search" params={raw} />
          </>
        )}
      </div>
    </div>
  );
}
