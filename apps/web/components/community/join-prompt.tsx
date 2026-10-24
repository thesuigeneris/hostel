import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

/** Friendly state for `not_resident` / `forbidden` errors. */
export function JoinPrompt({ hostelSlug, pending }: { hostelSlug?: string; pending?: boolean }) {
  if (pending) {
    return (
      <EmptyState title="Waiting for the owner to approve you">
        Your request to join this hostel&apos;s community has been sent. Once the owner confirms you live here, you can post, report issues and review.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      title="Join this hostel's community"
      action={<ButtonLink href={hostelSlug ? `/community/join?hostel=${hostelSlug}` : '/community/join'}>I live here</ButtonLink>}
    >
      The board, issues and resident directory are only for people who live here. Tell us you&apos;re a resident and the owner will confirm it.
    </EmptyState>
  );
}
