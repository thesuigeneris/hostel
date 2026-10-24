import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { NearMeButton } from '@/components/NearMe';
import { type SearchParams, SearchFilters } from '@/components/SearchFilters';
import { SearchResults } from '@/components/SearchResults';
import { Flash } from '@/components/ui';
import { publicApi } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Find a hostel or PG in Hyderabad',
  description: 'Search hostels and PGs by area, rent, sharing and food. See live beds, real photos and verified resident reviews.',
  alternates: { canonical: '/hostels' },
};

export default async function HostelsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const q = await searchParams;
  const { view: _view, ...filters } = q;
  let error: string | undefined;
  const result = await publicApi(30)
    .hostels.search(filters)
    .catch((e: Error) => {
      error = e.message;
      return { items: [], total: 0, page: 1, limit: 20 };
    });
  const toggle = (view: string) => {
    const p = new URLSearchParams(Object.entries({ ...q, view }).filter((e): e is [string, string] => !!e[1]));
    return `/hostels?${p.toString()}`;
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{result.total} hostels{q.area ? ` in ${q.area}` : ' in Hyderabad'}</h1>
        <div className="flex gap-2">
          <Suspense>
            <NearMeButton />
          </Suspense>
          <Link href={toggle('list')} className={`h-9 rounded-xl px-3 text-sm leading-9 no-underline ${q.view !== 'map' ? 'bg-brand text-white' : 'bg-surface text-ink-soft'}`}>List</Link>
          <Link href={toggle('map')} className={`h-9 rounded-xl px-3 text-sm leading-9 no-underline ${q.view === 'map' ? 'bg-brand text-white' : 'bg-surface text-ink-soft'}`}>Map</Link>
        </div>
      </div>
      <SearchFilters q={q} />
      <div className="mt-6">
        <Flash error={error} />
        <SearchResults result={result} q={q} base="/hostels" />
      </div>
    </div>
  );
}
