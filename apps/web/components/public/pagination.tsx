import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';

/** Prev/next links that keep the other query params. */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page') q.set(k, v);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonClass('secondary', 'sm')}>← Previous</Link>
      ) : (
        <span className={buttonClass('secondary', 'sm', 'pointer-events-none opacity-40')}>← Previous</span>
      )}
      <span className="text-sm text-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={buttonClass('secondary', 'sm')}>Next →</Link>
      ) : (
        <span className={buttonClass('secondary', 'sm', 'pointer-events-none opacity-40')}>Next →</span>
      )}
    </nav>
  );
}
