import { OWNER_PLANS } from '@hostels/shared';
import { PageHeader, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, planLabel, rupees } from '@/lib/format';

export default async function AdminBilling() {
  const client = await api();
  const [subs, overdue, ownerBills, moves] = await Promise.all([
    client.admin.subscriptions(),
    client.admin.overdue(),
    client.admin.ownerInvoices(),
    client.admin.moves(),
  ]);
  return (
    <>
      <PageHeader title="Subscriptions & bills" />
      <h2 className="mb-3 text-lg font-semibold">Overdue tenant bills ({overdue.length})</h2>
      {overdue.length === 0 ? <p className="mb-8 text-sm text-ink-soft">Nothing overdue.</p> : (
        <div className="mb-8">
          <Table head={['Tenant', 'Phone', 'Hostel', 'Amount', 'Due']}>
            {overdue.map((o) => (
              <tr key={o.invoice.id}><Td>{o.userName}</Td><Td>+91 {o.phone}</Td><Td>{o.hostelName}</Td><Td>{rupees(o.invoice.totalAmount)}</Td><Td className="text-danger">{dateLabel(o.invoice.dueDate)}</Td></tr>
            ))}
          </Table>
        </div>
      )}
      <h2 className="mb-3 text-lg font-semibold">Subscriptions ({subs.length})</h2>
      <div className="mb-8">
        <Table head={['Tenant', 'Hostel', 'Food', 'Since', 'Status']}>
          {subs.map((s) => (
            <tr key={s.subscription.id}>
              <Td><div>{s.user.name || '—'}</div><div className="text-xs text-ink-muted">+91 {s.user.phone}</div></Td>
              <Td>{s.hostelName}</Td>
              <Td>{planLabel(s.subscription.mealPlan)}</Td>
              <Td>{dateLabel(s.subscription.startDate)}{s.subscription.cancelAt && <div className="text-xs text-ink-muted">ends {dateLabel(s.subscription.cancelAt)}</div>}</Td>
              <Td><StatusBadge status={s.subscription.status} /></Td>
            </tr>
          ))}
        </Table>
      </div>
      <h2 className="mb-3 text-lg font-semibold">Scheduled moves ({moves.filter((m) => m.status === 'scheduled').length})</h2>
      <div className="mb-8">
        <Table head={['Move date', 'Status', 'Created']}>
          {moves.map((m) => <tr key={m.id}><Td>{dateLabel(m.moveDate)}</Td><Td><StatusBadge status={m.status} /></Td><Td>{dateLabel(m.createdAt)}</Td></tr>)}
        </Table>
      </div>
      <h2 className="mb-3 text-lg font-semibold">Owner plan bills</h2>
      <Table head={['Hostel', 'Plan', 'Period', 'Amount', 'Status']}>
        {ownerBills.map((b) => (
          <tr key={b.id}>
            <Td>{b.hostelName}</Td><Td>{OWNER_PLANS[b.plan].label}</Td><Td>{dateLabel(b.periodStart)} – {dateLabel(b.periodEnd)}</Td><Td>{rupees(b.amount)}</Td>
            <Td><StatusBadge status={b.isOverdue ? 'overdue' : b.status} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
