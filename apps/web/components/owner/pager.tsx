import { ButtonLink } from '@/components/ui/button';
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <ButtonLink href={href(page - 1)} variant="secondary" size="sm">
            Previous
          </ButtonLink>
        )}
        {page < pages && (
          <ButtonLink href={href(page + 1)} variant="secondary" size="sm">
            Next
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
