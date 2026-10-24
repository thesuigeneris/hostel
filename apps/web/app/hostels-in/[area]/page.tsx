import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createApiClient } from '@hostels/shared';
import { Map } from '@/components/map';
import { HostelCard } from '@/components/public/hostel-card';
import { LoadError } from '@/components/public/load-error';
import { Pagination } from '@/components/public/pagination';
import { load } from '@/components/public/safe';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { API_URL } from '@/lib/config';
import { rupees } from '@/lib/format';

export const dynamic = 'force-dynamic';

const getArea = cache(async (slug: string) => {
  const r = await load(createApiClient(API_URL).areas());
  if (!r.ok) return { ok: false as const, message: r.message };
  const area = r.data.find((a) => a.slug === slug);
  if (!area) notFound();
  return { ok: true as const, area, all: r.data };
});

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area: slug } = await params;
  const r = await getArea(slug);
  if (!r.ok) return { title: 'Hostels' };
  const { area } = r;
  const title = `Hostels & PGs in ${area.area}, ${area.city}`;
  const description = `${area.hostelCount} hostels and PGs in ${area.area}${area.minRent ? ` from ${rupees(area.minRent)}/month` : ''}. Verified partners with food and no advance, with reviews from real residents.`;
  return { title, description, alternates: { canonical: `/hostels-in/${area.slug}` }, openGraph: { title, description } };
}

export default async function AreaPage({ params, searchParams }: { params: Promise<{ area: string }>; searchParams: Promise<{ page?: string }> }) {
  const { area: slug } = await params;
  const { page } = await searchParams;
  const r = await getArea(slug);
  if (!r.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <LoadError message={r.message} retryHref={`/hostels-in/${slug}`} />
      </div>
    );
  }
  const { area, all } = r;
  const results = await load(createApiClient(API_URL).hostels.search({ area: area.area, city: area.city, page: Number(page) || 1, pageSize: 24 }));
  const nearby = all.filter((a) => a.city === area.city && a.slug !== area.slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        Hostels &amp; PGs in {area.area}, {area.city}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        {area.hostelCount} hostels{area.minRent ? `, from ${rupees(area.minRent)} a month` : ''}. Verified partners include food and need no advance, and every review is
        written by someone who has lived there.
      </p>

      {!results.ok ? (
        <div className="mt-8">
          <LoadError message={results.message} retryHref={`/hostels-in/${slug}`} />
        </div>
      ) : results.data.items.length === 0 ? (
        <EmptyState className="mt-8" title={`No hostels listed in ${area.area} yet`} action={<ButtonLink href="/search">Search all areas</ButtonLink>} />
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="grid gap-5 sm:grid-cols-2">
              {results.data.items.map((h) => (
                <HostelCard key={h.id} h={h} />
              ))}
            </div>
            <Pagination page={results.data.page} pageSize={results.data.pageSize} total={results.data.total} basePath={`/hostels-in/${slug}`} params={{}} />
          </div>
          <div className="h-80 lg:sticky lg:top-24 lg:h-[70vh]">
            <Map markers={results.data.items.map((h) => ({ id: h.id, lat: h.lat, lng: h.lng, label: h.name, href: `/hostels/${h.slug}`, sublabel: `from ${rupees(h.minRent)}` }))} />
          </div>
        </div>
      )}

      {nearby.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">Other areas in {area.city}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {nearby.map((a) => (
              <ButtonLink key={a.slug} href={`/hostels-in/${a.slug}`} variant="secondary" size="sm">
                {a.area} ({a.hostelCount})
              </ButtonLink>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
