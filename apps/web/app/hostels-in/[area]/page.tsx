import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { type SearchParams, SearchFilters } from '@/components/SearchFilters';
import { SearchResults } from '@/components/SearchResults';
import { Flash } from '@/components/ui';
import { publicApi } from '@/lib/api';

type Props = { params: Promise<{ area: string }>; searchParams: Promise<SearchParams> };

async function areaFor(slug: string) {
  const areas = await publicApi(300).hostels.areas().catch(() => []);
  return areas.find((a) => a.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const area = await areaFor((await params).area);
  if (!area) return { title: 'Area not found' };
  return {
    title: `Hostels and PGs in ${area.area}, Hyderabad`,
    description: `${area.count} hostels and PGs in ${area.area} with live beds, rent, food and verified resident reviews. Partner hostels need no advance.`,
    alternates: { canonical: `/hostels-in/${area.slug}` },
  };
}

export default async function AreaPage({ params, searchParams }: Props) {
  const area = await areaFor((await params).area);
  if (!area) notFound();
  const q = { ...(await searchParams), area: area.area };
  let error: string | undefined;
  const result = await publicApi(60)
    .hostels.search(q)
    .catch((e: Error) => {
      error = e.message;
      return { items: [], total: 0, page: 1, limit: 20 };
    });
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Hostels and PGs in {area.area}</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">
        Compare {area.count} hostels in {area.area}, Hyderabad by rent, sharing and food. Verified partners take no advance and include weekly
        themed menus; every review comes from a verified resident.
      </p>
      <div className="mt-6">
        <SearchFilters q={q} action={`/hostels-in/${area.slug}`} />
      </div>
      <div className="mt-6">
        <Flash error={error} />
        <SearchResults result={result} q={q} base={`/hostels-in/${area.slug}`} />
      </div>
    </div>
  );
}
