import { REVIEW_MIN_STAY_DAYS } from '@hostels/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppliedFilters, appliedFilters, type SearchParams, SearchFilters, searchHref } from '@/components/SearchFilters';
import { SearchResults } from '@/components/SearchResults';
import { SearchViewToggle } from '@/components/SearchViewToggle';
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
    description: `${area.count} hostels and PGs in ${area.area} with rent, food, owner-reported beds and resident reviews. Partner hostels need no advance.`,
    alternates: { canonical: `/hostels-in/${area.slug}` },
  };
}

export default async function AreaPage({ params, searchParams }: Props) {
  const area = await areaFor((await params).area);
  if (!area) notFound();
  // The area comes from the path, so it is left out of this page's own links.
  const { area: _ignored, ...q } = await searchParams;
  const { view: _view, ...filters } = q;
  const result = await publicApi(60).hostels.search({ ...filters, area: area.area });
  const base = `/hostels-in/${area.slug}`;
  return (
    <div className="mx-auto max-w-content px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-soft">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/hostels">All hostels</Link> <span aria-hidden>/</span></li>
          <li aria-current="page">{area.area}</li>
        </ol>
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-prose">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Hostels and PGs in {area.area}</h1>
          <p className="mt-2 text-ink-soft">
            Compare {area.count} {area.count === 1 ? 'hostel' : 'hostels'} in {area.area}, Hyderabad by rent, sharing and food. Verified partners take
            no advance. Reviews come only from residents who stayed at least {REVIEW_MIN_STAY_DAYS} days.
          </p>
        </div>
        <SearchViewToggle q={q} base={base} />
      </div>
      <SearchFilters q={q} action={base} lockArea />
      <AppliedFilters items={appliedFilters(q, base, { lockArea: true })} clearHref={searchHref(base, { view: q.view })} />
      <section aria-labelledby="results-heading" className="mt-6">
        <h2 id="results-heading" className="sr-only">Results</h2>
        <SearchResults result={result} q={q} base={base} lockArea />
      </section>
    </div>
  );
}
