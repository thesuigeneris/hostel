import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { HostelPicker } from '@/components/owner/hostel-picker';
import { LoadError, Table, Td } from '@/components/owner/ui';
import { DIET_LABEL, formatDate, MEAL_PLAN_LABEL, SUBSCRIPTION_STATUS_LABEL } from '@/lib/format';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ hostelId?: string }> }) {
  const sp = await searchParams;
  const api = await serverApi();
  const hostels = await load(() => api.owner.hostels());
  if (hostels.error !== null) return <LoadError message={hostels.error} />;
  const partners = hostels.data.filter((h) => h.partnerStatus === 'verified');
  if (partners.length === 0)
    return (
      <div>
        <PageHeader title="Subscribers" />
        <EmptyState title="Subscribers come with the verified partner programme" action={<ButtonLink href="/owner/hostels">Go to your hostels</ButtonLink>}>
          Verified partners get tenants who pay one monthly bill for bed + food, with no advance.
        </EmptyState>
      </div>
    );
  const hostel = partners.find((h) => h.id === sp.hostelId) ?? partners[0]!;
  const subs = await load(() => api.owner.subscribers(hostel.id));

  return (
    <div>
      <PageHeader title="Subscribers" subtitle="Tenants who booked through Hostels. We bill them monthly and pay you out." actions={<HostelPicker hostels={partners} value={hostel.id} />} />
      {subs.error !== null ? (
        <LoadError message={subs.error} />
      ) : subs.data.length === 0 ? (
        <EmptyState title="No subscribers yet">Keep beds-free up to date and menus published — subscribers pick hostels with fresh info.</EmptyState>
      ) : (
        <Table head={['Tenant', 'Plan', 'Diet', 'Since', 'Status', 'Bills']}>
          {subs.data.map((s) => (
            <tr key={s.id}>
              <Td>
                <div className="font-medium">{s.user.name || 'Tenant'}</div>
                <div className="text-xs text-muted">+91 {s.user.phone}</div>
              </Td>
              <Td>{MEAL_PLAN_LABEL[s.mealPlan]}</Td>
              <Td>{DIET_LABEL[s.diet]}</Td>
              <Td>
                {formatDate(s.startDate)}
                {s.cancelAt && <div className="text-xs text-warn">leaves {formatDate(s.cancelAt)}</div>}
              </Td>
              <Td>
                <Badge tone={s.status === 'active' ? 'ok' : s.status === 'pending' ? 'warn' : 'neutral'}>{SUBSCRIPTION_STATUS_LABEL[s.status]}</Badge>
              </Td>
              <Td>{s.overdueInvoices > 0 ? <Badge tone="danger">{s.overdueInvoices} overdue</Badge> : <span className="text-muted">Up to date</span>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
