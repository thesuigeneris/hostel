import { addDays, istDate } from '@hostels/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { scheduleMoveAction } from '@/app/account/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Empty, Field, Flash, Input, LinkButton, PageHeader, Select } from '@/components/ui';
import { api, publicApi, requireUser } from '@/lib/api';
import { rupees, SHARING_LABEL } from '@/lib/format';

export const metadata: Metadata = { title: 'Move', robots: { index: false } };

type Props = { searchParams: Promise<{ to?: string; error?: string }> };

export default async function MovePage({ searchParams }: Props) {
  const q = await searchParams;
  await requireUser('/account/move', 'tenant');
  const mine = await (await api()).me.subscription();
  if (!mine || mine.subscription.status !== 'active') redirect('/account');
  const verified = await publicApi(60).hostels.search({ verified: 'true', limit: 50 });
  const slug = q.to ?? mine.hostel.slug;
  const dest = await publicApi(0).hostels.get(slug).catch(() => null);
  const rooms = (dest?.roomTypes ?? []).filter((r) => r.id !== mine.roomType.id && r.bedsAvailable > 0);
  const earliest = addDays(istDate(), 1);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader title="Move hostel or room" subtitle="Your bed at the new place is held as soon as you schedule. Bills after the move date use the new rent." />
      <Flash error={q.error} />
      <Card>
        <form className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Where to">
              <Select name="to" defaultValue={slug}>
                {verified.items.map((h) => <option key={h.id} value={h.slug}>{h.name} · {h.area}{h.slug === mine.hostel.slug ? ' (current)' : ''}</option>)}
              </Select>
            </Field>
          </div>
          <SubmitButton variant="secondary">Show rooms</SubmitButton>
        </form>
      </Card>

      <div className="mt-6">
        {rooms.length === 0 ? (
          <Empty title="No free beds here">Try another hostel.</Empty>
        ) : (
          <form action={scheduleMoveAction} className="space-y-4">
            <div className="space-y-2">
              {rooms.map((r, i) => (
                <label key={r.id} className="flex cursor-pointer items-center justify-between rounded-2xl border border-line bg-surface p-4 has-[:checked]:border-brand">
                  <span className="flex items-center gap-3">
                    <input type="radio" name="toRoomTypeId" value={r.id} defaultChecked={i === 0} required />
                    <span className="font-medium">{SHARING_LABEL[r.sharing]}</span>
                  </span>
                  <span className="text-sm">{rupees(r.monthlyRent)} /month · {r.bedsAvailable} free</span>
                </label>
              ))}
            </div>
            <Field label="Move date" hint="Tomorrow or later.">
              <Input type="date" name="moveDate" min={earliest} defaultValue={earliest} required />
            </Field>
            <div className="flex gap-2">
              <SubmitButton>Schedule move</SubmitButton>
              <LinkButton href="/account" variant="ghost">Cancel</LinkButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
