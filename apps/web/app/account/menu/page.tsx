import { MenuSkips } from '@/components/account/menu-skips';
import { LoadError } from '@/components/public/load-error';
import { load } from '@/components/public/safe';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MenuPage() {
  const r = await load((await serverApi()).tenant.menu());
  if (!r.ok) {
    if (r.status === 404 || r.code === 'not_found') {
      return (
        <EmptyState title="No active plan" action={<ButtonLink href="/search?verified=true">Find a partner hostel</ButtonLink>}>
          The weekly menu and meal skips are available once you subscribe to a partner hostel with a food plan.
        </EmptyState>
      );
    }
    return <LoadError message={r.message} retryHref="/account/menu" />;
  }
  if (r.data.days.length === 0) return <EmptyState title="Menu coming soon">Your hostel hasn&apos;t published the menu for the coming days yet.</EmptyState>;
  return <MenuSkips initial={r.data} />;
}
