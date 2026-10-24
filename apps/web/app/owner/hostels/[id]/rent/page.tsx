import { ApiError, istDate, monthOf, RENT_METHODS } from '@hostels/shared';
import { recordRentAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Upsell } from '@/components/Upsell';
import { Card, Flash, Input, Select, Stat, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { monthLabel, rupees, titleCase, whatsappLink } from '@/lib/format';
import { ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string; error?: string; ok?: string }> };

export default async function RentPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const h = await ownerHostel(id);
  const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : monthOf(istDate());
  const sheet = await (await api()).owner.rent(id, month).catch((e) => (e instanceof ApiError && e.code === 'plan_required' ? null : Promise.reject(e)));
  if (!sheet) return <Upsell hostelId={id} plan="pro" feature="The rent tracker" suspended={h.plan.suspended} />;
  const today = istDate();
  const unpaidRows = sheet.rows.filter((r) => r.status !== 'paid');
  const reminder = (r: (typeof sheet.rows)[number]) =>
    `Hi ${r.name.split(' ')[0] || 'there'}, a reminder from ${h.name}: rent for ${monthLabel(month)} is ${rupees(r.amountDue - r.amountPaid)}${r.amountPaid ? ` (after the ${rupees(r.amountPaid)} you paid)` : ''}. Please pay by UPI or cash at the office. Thank you!`;

  return (
    <div className="space-y-6">
      <Flash error={q.error} ok={q.ok} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Month</span>
            <Input type="month" name="month" defaultValue={month} className="w-44" />
          </label>
          <SubmitButton variant="secondary">Show</SubmitButton>
        </form>
        <p className="text-sm text-ink-soft">Tracks rent you collect yourself. Subscribers of partner hostels pay online and aren&apos;t listed here.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`Due in ${monthLabel(month)}`} value={rupees(sheet.totals.due)} />
        <Stat label="Collected" value={rupees(sheet.totals.collected)} />
        <Stat label="Still unpaid" value={rupees(Math.max(0, sheet.totals.due - sheet.totals.collected))} hint={`${sheet.totals.unpaid} of ${sheet.rows.length} residents`} />
      </div>
      {sheet.rows.length === 0 ? (
        <Card className="text-sm text-ink-soft">No residents for this month. Add them in the Residents tab.</Card>
      ) : (
        <>
        {unpaidRows.length > 0 && month <= today.slice(0, 7) && (
          <Card className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>{unpaidRows.length} {unpaidRows.length === 1 ? 'resident has' : 'residents have'} not paid in full. Send a friendly reminder on WhatsApp from the Remind link in each row.</span>
          </Card>
        )}
        <Table head={['Resident', 'Due', 'Paid', 'On', 'How', 'Note', 'Status', '']}>
          {sheet.rows.map((r) => (
            <tr key={r.residencyId}>
              <Td><div className="font-medium">{r.name || '—'}</div><div className="text-xs text-ink-muted">+91 {r.phone}</div></Td>
              <Td>{rupees(r.amountDue)}</Td>
              <Td colSpan={4}>
                <form id={`rent-${r.residencyId}`} action={recordRentAction} className="grid grid-cols-[100px_140px_100px_1fr] gap-2">
                  <input type="hidden" name="hostelId" value={id} />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="residencyId" value={r.residencyId} />
                  <Input type="number" name="amountPaid" min={0} defaultValue={r.amountPaid || r.amountDue} className="h-8" aria-label="Amount paid" />
                  <Input type="date" name="paidOn" defaultValue={r.paidOn ?? today} className="h-8" aria-label="Paid on" />
                  <Select name="method" defaultValue={r.method ?? 'upi'} className="h-8" aria-label="Method">
                    {RENT_METHODS.map((m) => <option key={m} value={m}>{m === 'upi' ? 'UPI' : titleCase(m)}</option>)}
                  </Select>
                  <Input name="note" defaultValue={r.note} maxLength={300} className="h-8" aria-label="Note" />
                </form>
              </Td>
              <Td><StatusBadge status={r.status === 'unpaid' ? 'due' : r.status} /></Td>
              <Td>
                <div className="flex items-center gap-2">
                  <SubmitButton form={`rent-${r.residencyId}`} size="sm" variant="secondary">Save</SubmitButton>
                  {r.status !== 'paid' && month <= today.slice(0, 7) && (
                    <a href={whatsappLink(r.phone, reminder(r))} target="_blank" rel="noreferrer" className="text-sm">Remind</a>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
        </>
      )}
    </div>
  );
}
