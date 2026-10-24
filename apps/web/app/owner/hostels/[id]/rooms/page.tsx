import { SHARING_TYPES } from '@hostels/shared';
import { addRoomAction, deleteRoomAction, updateRoomAction } from '@/app/owner/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, Field, Flash, Input, Select } from '@/components/ui';
import { SHARING_LABEL, timeAgo } from '@/lib/format';
import { ownerHostel } from '@/lib/owner';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

export default async function RoomsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const h = await ownerHostel(id);
  const path = `/owner/hostels/${id}/rooms`;
  const unused = SHARING_TYPES.filter((s) => !h.roomTypes.some((r) => r.sharing === s));

  return (
    <div className="space-y-6">
      <Flash error={q.error} ok={q.ok} />
      <p className="text-sm text-ink-soft">Update free beds whenever someone moves in or out. Your public page shows the count and when you last changed it.{h.isVerified && ' Partner hostels: beds also update on their own as tenants subscribe and leave.'}</p>
      {h.roomTypes.map((r) => (
        <Card key={r.id}>
          <form action={updateRoomAction} className="grid items-end gap-3 sm:grid-cols-[1fr_repeat(4,120px)_auto]">
            <Back to={path} />
            <input type="hidden" name="roomId" value={r.id} />
            <div>
              <div className="font-medium">{SHARING_LABEL[r.sharing]}</div>
              <div className="text-xs text-ink-muted">{r.bedsUpdatedAt ? `Beds updated ${timeAgo(r.bedsUpdatedAt)}` : 'Beds not updated since this was recorded'}</div>
            </div>
            <Field label="Rent /month"><Input type="number" name="monthlyRent" min={0} defaultValue={r.monthlyRent} required /></Field>
            <Field label="Advance / deposit"><Input type="number" name="advanceAmount" min={0} defaultValue={r.advanceAmount} /></Field>
            <Field label="Total beds"><Input type="number" name="totalBeds" min={1} defaultValue={r.totalBeds} required /></Field>
            <Field label="Beds free"><Input type="number" name="bedsAvailable" min={0} defaultValue={r.bedsAvailable} required /></Field>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </form>
          <form action={deleteRoomAction} className="mt-2">
            <Back to={path} />
            <input type="hidden" name="roomId" value={r.id} />
            <button type="submit" className="text-xs text-ink-muted hover:text-danger">Remove this room type</button>
          </form>
        </Card>
      ))}
      {unused.length > 0 && (
        <Card className="border-dashed">
          <h2 className="mb-3 font-semibold">Add a room type</h2>
          <form action={addRoomAction} className="grid items-end gap-3 sm:grid-cols-[1fr_repeat(4,120px)_auto]">
            <input type="hidden" name="hostelId" value={id} />
            <Field label="Sharing">
              <Select name="sharing">{unused.map((s) => <option key={s} value={s}>{SHARING_LABEL[s]}</option>)}</Select>
            </Field>
            <Field label="Rent /month"><Input type="number" name="monthlyRent" min={0} required placeholder="9000" /></Field>
            <Field label="Advance / deposit"><Input type="number" name="advanceAmount" min={0} defaultValue={0} /></Field>
            <Field label="Total beds"><Input type="number" name="totalBeds" min={1} required /></Field>
            <Field label="Beds free"><Input type="number" name="bedsAvailable" min={0} required /></Field>
            <SubmitButton>Add</SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
