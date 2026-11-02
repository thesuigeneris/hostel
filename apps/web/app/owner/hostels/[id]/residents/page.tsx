import { istDate, residencyLabel } from '@hostels/shared';
import { addResidentAction, endResidentAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Upsell } from '@/components/Upsell';
import { Badge, Card, Field, Flash, Input, Select, Table, Td } from '@/components/ui';
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
          <form action={addResidentAction} className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_120px_160px_auto]">
            <input type="hidden" name="hostelId" value={id} />
            <Field label="Phone"><Input name="phone" inputMode="tel" autoComplete="off" required placeholder="98765 43210" /></Field>
            <Field label="Name" optional><Input name="name" maxLength={80} /></Field>
            <Field label="Room" optional>
              <Select name="roomTypeId" defaultValue="">
                <option value="">Not set</option>
                {h.roomTypes.map((r) => <option key={r.id} value={r.id}>{SHARING_LABEL[r.sharing]}</option>)}
              </Select>
            </Field>
            <Field label="Rent (₹/month)"><Input type="number" name="monthlyRent" min={0} required defaultValue={h.roomTypes[0]?.monthlyRent} /></Field>
            <Field label="Living here since"><Input type="date" name="startDate" required defaultValue={today} max={today} /></Field>
            <SubmitButton pendingText="Adding…">Add</SubmitButton>
          </form>
        </Card>
      ) : (
        <Upsell hostelId={id} plan="pro" feature="The resident register" suspended={h.plan.suspended} />
      )}

      <section aria-labelledby="current-heading">
        <h2 id="current-heading" className="mb-1 text-lg font-semibold">Current residents ({current.length})</h2>
        <p className="mb-3 text-sm text-ink-soft">
          For a move-out date ahead, the resident keeps access to the board and issues until that day, then the stay ends on its own.
        </p>
        <Table head={['Resident', 'Room', 'Rent', 'Since', 'Status', 'Move out']}>
          {current.map((r) => {
            const label = residencyLabel(r, today);
            const leaving = label.startsWith('Leaving');
            return (
              <tr key={r.id}>
                <Td>
                  <div className="font-medium [overflow-wrap:anywhere]">{r.name || '—'}</div>
                  <div className="text-xs text-ink-muted">+91 {r.phone}</div>
                </Td>
                <Td>{room(r.roomTypeId) ? SHARING_LABEL[room(r.roomTypeId)!.sharing] : '—'}</Td>
                <Td className="tabular-nums">{rupees(r.monthlyRent)}</Td>
                <Td className="whitespace-nowrap">{dateLabel(r.startDate)}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={r.status === 'invited' || leaving ? 'food' : 'green'}>{label}</Badge>
                    {r.source === 'subscription' && <Badge tone="green">Subscriber</Badge>}
                  </span>
                </Td>
                <Td>
                  {r.source === 'owner' &&
                    (r.status === 'invited' ? (
                      <form action={endResidentAction}>
                        <input type="hidden" name="hostelId" value={id} />
                        <input type="hidden" name="residencyId" value={r.id} />
                        <input type="hidden" name="status" value="invited" />
                        <input type="hidden" name="endDate" value={today} />
                        <SubmitButton size="sm" variant="ghost" confirm={`Withdraw the invite to +91 ${r.phone}?`}>Withdraw invite</SubmitButton>
                      </form>
                    ) : (
                      <form action={endResidentAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="hostelId" value={id} />
                        <input type="hidden" name="residencyId" value={r.id} />
                        <Input
                          type="date"
                          name="endDate"
                          required
                          min={r.startDate}
                          defaultValue={r.endDate ?? today}
                          aria-label={`Move-out date for ${r.name || `+91 ${r.phone}`}`}
                          className="h-9 w-40"
                        />
                        <SubmitButton size="sm" variant="secondary">{leaving ? 'Change date' : 'Set move-out'}</SubmitButton>
                      </form>
                    ))}
                  {r.source === 'subscription' && <span className="text-xs text-ink-muted">Ends with their plan</span>}
                </Td>
              </tr>
            );
          })}
          {current.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-center text-ink-soft">No residents yet.{canAdd && ' Add the first one above.'}</Td>
            </tr>
          )}
        </Table>
      </section>

      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-ink-soft">Past residents ({past.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {past.map((r) => (
              <li key={r.id} className="[overflow-wrap:anywhere]">
                {r.name || `+91 ${r.phone}`} · {dateLabel(r.startDate)}
                {r.endDate && ` – ${dateLabel(r.endDate)}`} · {residencyLabel(r, today)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
