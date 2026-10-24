import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="mx-auto max-w-content px-4 pt-6" aria-busy="true">
      <output className="sr-only">Loading hostel…</output>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-4 aspect-[4/3] w-full sm:aspect-auto sm:h-[380px]" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-6 h-32 w-full" />
        </div>
        <Skeleton className="hidden h-72 lg:block" />
      </div>
    </div>
  );
}
