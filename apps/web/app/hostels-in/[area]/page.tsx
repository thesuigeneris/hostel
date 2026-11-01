import { REVIEW_MIN_STAY_DAYS } from '@hostels/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppliedFilters, appliedFilters, type SearchParams, SearchFilters, searchHref } from '@/components/SearchFilters';
import { SearchResults } from '@/components/SearchResults';
import { SearchViewToggle } from '@/components/SearchViewToggle';
import { Flash } from '@/components/ui';
import { publicApi } from '@/lib/api';

type Props = { params: Promise<{ area: string }>; searchParams: Promise<SearchParams> };

/** The area for a slug, or `failed` when the API could not be reached (so the page can say so instead of 404ing). */
async function areaFor(slug: string) {
  try {
    const areas = await publicApi(300).hostels.areas();
    return { area: areas.find((a) => a.slug === slug) ?? null, failed: false };
  } catch {
    return { area: null, failed: true };
  }
}

/** Best-effort name from the slug while the API is down: `madhapur` → `Madhapur`. */
const nameFromSlug = (slug: string) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const slug = (await params).area;
  const { area } = await areaFor(slug);
  const name = area?.area ?? nameFromSlug(slug);
  // Filtered and paged lists are near-duplicates of the plain area page, so only that one is indexed.
  const filtered = Object.entries(await searchParams).some(([k, v]) => v && k !== 'view');
  return {
    title: `Hostels and PGs in ${name}, Hyderabad`,
    description: `${area ? `${area.count} hostels` : 'Hostels'} and PGs in ${name} with rent, food, owner-reported beds and resident reviews. Partner hostels need no advance.`,
    alternates: { canonical: `/hostels-in/${slug}` },
    ...(filtered || !area ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function AreaPage({ params, searchParams }: Props) {
  const slug = (await params).area;
  const { area, failed } = await areaFor(slug);
  if (!area && !failed) notFound();
  const name = area?.area ?? nameFromSlug(slug);
  // The area comes from the path, so it is left out of this page's own links.
  const { area: _ignored, ...q } = await searchParams;
  const { view: _view, ...filters } = q;
  let error: string | undefined = failed ? 'We could not load hostels right now. Please try again in a minute.' : undefined;
  const result = area
    ? await publicApi(60)
        .hostels.search({ ...filters, area: area.area })
        .catch(() => {
          error = 'We could not run this search. Check the filters, or clear them and try again.';
          return { items: [], total: 0, page: Number(q.page) || 1, limit: 20 };
        })
    : null;
  const base = `/hostels-in/${slug}`;
  return (
    <div className="mx-auto max-w-content px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-soft">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/hostels">All hostels</Link> <span aria-hidden>/</span></li>
          <li aria-current="page">{name}</li>
        </ol>
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-prose">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Hostels and PGs in {name}</h1>
          <p className="mt-2 text-ink-soft">
            Compare {area ? `${area.count} ${area.count === 1 ? 'hostel' : 'hostels'}` : 'hostels'} in {name}, Hyderabad by rent, sharing and food. Verified
            partners take no advance. Reviews come only from residents who stayed at least {REVIEW_MIN_STAY_DAYS} days.
          </p>
        </div>
        {area && <SearchViewToggle q={q} base={base} />}
      </div>
      {area && (
        <>
          <SearchFilters q={q} action={base} lockArea />
          <AppliedFilters items={appliedFilters(q, base, { lockArea: true })} clearHref={searchHref(base, { view: q.view })} />
        </>
      )}
      <section aria-labelledby="results-heading" className="mt-6">
        <h2 id="results-heading" className="sr-only">Results</h2>
        <Flash error={error} />
        {result && !error && <SearchResults result={result} q={q} base={base} lockArea />}
      </section>
    </div>
  );
}
