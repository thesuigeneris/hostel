import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="mx-auto max-w-content px-4 py-8" aria-busy="true">
      <output className="sr-only">Loading hostels…</output>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <Skeleton className="mt-6 h-28 w-full" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-6 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
