import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export function LoadError({ message, retryHref }: { message: string; retryHref?: string }) {
  return (
    <EmptyState
      title="Couldn't load this"
      action={retryHref ? <ButtonLink href={retryHref} variant="secondary">Try again</ButtonLink> : undefined}
    >
      {message}
    </EmptyState>
  );
}
