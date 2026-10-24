/** Placeholder blocks shown while a server page loads, so slow API calls never leave a blank screen. */
export function PageSkeleton({ variant = 'list', label = 'Loading' }: { variant?: 'list' | 'grid' | 'detail'; label?: string }) {
  const block = 'animate-pulse rounded-2xl bg-line/60';
  return (
    <output className="mx-auto block max-w-6xl px-4 py-8" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <div className={`${block} h-8 w-64`} />
      <div className={`${block} mt-3 h-4 w-96 max-w-full`} />
      {variant === 'detail' ? (
        <>
          <div className={`${block} mt-6 aspect-[3/1] w-full`} />
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className={`${block} h-24`} />)}</div>
            <div className={`${block} h-64`} />
          </div>
        </>
      ) : variant === 'grid' ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`${block} aspect-[4/3]`} />)}
        </div>
      ) : (
        <div className="mx-auto mt-6 max-w-3xl space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className={`${block} h-20`} />)}</div>
      )}
    </output>
  );
}
