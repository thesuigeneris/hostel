import { createApiClient } from '@hostels/shared';
import { MoveForm, ScheduledMove } from '@/components/account/move-form';
import { LoadError } from '@/components/public/load-error';
import { load } from '@/components/public/safe';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { API_URL } from '@/lib/config';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MovePage() {
  const [stay, hostels] = await Promise.all([
    load((await serverApi()).tenant.stay()),
    load(createApiClient(API_URL).hostels.search({ verified: true, pageSize: 50 })),
  ]);
  if (!stay.ok) return <LoadError message={stay.message} retryHref="/account/move" />;
  const { subscription: sub, upcomingMove } = stay.data;
  if (!sub || sub.status !== 'active') {
    return (
      <EmptyState title="Moving needs an active plan" action={<ButtonLink href="/account">Back to my stay</ButtonLink>}>
        Once your subscription is active you can move to any partner hostel with no fee.
      </EmptyState>
    );
  }
  if (sub.cancelAt) return <EmptyState title="Your plan is ending">You can&apos;t schedule a move on a plan that is being cancelled.</EmptyState>;
  if (upcomingMove) {
    const to = hostels.ok ? hostels.data.items.find((h) => h.id === upcomingMove.toHostelId) : undefined;
    return <ScheduledMove move={upcomingMove} toName={to?.name ?? 'your new hostel'} />;
  }
  if (!hostels.ok) return <LoadError message={hostels.message} retryHref="/account/move" />;
  return <MoveForm hostels={hostels.data.items} currentHostelId={sub.hostelId} currentRoomTypeId={sub.roomTypeId} />;
}
