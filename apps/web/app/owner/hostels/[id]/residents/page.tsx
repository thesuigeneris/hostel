import { istDate } from '@hostels/shared';
import { addResidentAction, endResidentAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Upsell } from '@/components/Upsell';
import { Badge, Card, Field, Flash, Input, Select, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, rupees, SHARING_LABEL } from '@/lib/format';
import { hasPlan, ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

export default async function ResidentsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const h = await ownerHostel(id);
  const residents = await (await api()).owner.residents(id);
  const today = istDate();
  const canAdd = hasPlan(h.plan.effective, 'pro');
  const room = (rid: string | null) => h.roomTypes.find((r) => r.id === rid);
  const current = residents.filter((r) => r.status === 'active' || r.status === 'invited');
  const past = residents.filter((r) => r.status === 'ended' || r.status === 'declined');

  return (
    <div className="space-y-6">
      <Flash error={q.error} ok={q.ok} />
      {canAdd ? (
        <Card>
          <h2 className="font-semibold">Add a resident</h2>
          <p className="mt-1 text-sm text-ink-soft">They get an invite in the Hostels app when they log in with this number. Accepted residents can report issues, join the community and review after two weeks.</p>
          <form action={addResidentAction} className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_160px_120px_150px_auto]">
            <input type="hidden" name="hostelId" value={id} />
            <Field label="Phone"><Input name="phone" inputMode="tel" required placeholder="98765 43210" /></Field>
            <Field label="Name"><Input name="name" maxLength={80} /></Field>
            <Field label="Room">
              <Select name="roomTypeId" defaultValue="">
                <option value="">—</option>
                {h.roomTypes.map((r) => <option key={r.id} value={r.id}>{SHARING_LABEL[r.sharing]}</option>)}
              </Select>
            </Field>
            <Field label="Rent"><Input type="number" name="monthlyRent" min={0} required defaultValue={h.roomTypes[0]?.monthlyRent} /></Field>
            <Field label="Since"><Input type="date" name="startDate" required defaultValue={today} max={today} /></Field>
            <SubmitButton>Add</SubmitButton>
          </form>
        </Card>
      ) : (
        <Upsell hostelId={id} plan="pro" feature="The resident register" suspended={h.plan.suspended} />
      )}

      <Table head={['Resident', 'Room', 'Rent', 'Since', 'Status', '']}>
        {current.map((r) => (
          <tr key={r.id}>
            <Td><div className="font-medium">{r.name || '—'}</div><div className="text-xs text-ink-muted">+91 {r.phone}</div></Td>
            <Td>{room(r.roomTypeId) ? SHARING_LABEL[room(r.roomTypeId)!.sharing] : '—'}</Td>
            <Td>{rupees(r.monthlyRent)}</Td>
            <Td>{dateLabel(r.startDate)}</Td>
            <Td><span className="flex flex-wrap gap-1"><StatusBadge status={r.status} />{r.source === 'subscription' && <Badge tone="green">Subscriber</Badge>}</span></Td>
            <Td>
              {r.source === 'owner' && (
                <form action={endResidentAction} className="flex items-center gap-2">
                  <input type="hidden" name="hostelId" value={id} />
                  <input type="hidden" name="residencyId" value={r.id} />
                  <Input type="date" name="endDate" defaultValue={today} className="h-8 w-36" />
                  <SubmitButton size="sm" variant="ghost">Moved out</SubmitButton>
                </form>
              )}
            </Td>
          </tr>
        ))}
        {current.length === 0 && <tr><Td colSpan={6} className="text-center text-ink-soft">No residents yet.</Td></tr>}
      </Table>

      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-ink-soft">Past residents ({past.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {past.map((r) => <li key={r.id}>{r.name || `+91 ${r.phone}`} · {dateLabel(r.startDate)} – {dateLabel(r.endDate)} · <StatusBadge status={r.status} /></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
