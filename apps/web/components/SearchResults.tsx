import type { SearchResult } from '@hostels/shared';
import Link from 'next/link';
import { HostelCard } from './HostelCard';
import { ClientHostelMap } from './MapLoader';
import type { SearchParams } from './SearchFilters';
import { Empty } from './ui';

function pageHref(base: string, q: SearchParams, page: number) {
  const params = new URLSearchParams(Object.entries({ ...q, page: String(page) }).filter((e): e is [string, string] => !!e[1]));
  return `${base}?${params.toString()}`;
}

export function SearchResults({ result, q, base }: { result: SearchResult; q: SearchParams; base: string }) {
  if (!result.items.length) return <Empty title="No hostels match these filters">Try another area or a wider rent range.</Empty>;
  const pages = Math.ceil(result.total / result.limit);
  return (
    <>
      {q.view === 'map' ? (
        <ClientHostelMap
          height={560}
          points={result.items.map((h) => ({
            id: h.id,
            lat: h.lat,
            lng: h.lng,
            label: h.name,
            href: `/hostels/${h.slug}`,
            verified: h.isVerified,
            sub: h.minRent ? `from ₹${h.minRent.toLocaleString('en-IN')}` : undefined,
          }))}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((h) => <HostelCard key={h.id} h={h} />)}
        </div>
      )}
      {pages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={pageHref(base, q, p)} className={`grid h-9 w-9 place-items-center rounded-lg text-sm no-underline ${p === result.page ? 'bg-brand text-white' : 'bg-surface text-ink-soft'}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
