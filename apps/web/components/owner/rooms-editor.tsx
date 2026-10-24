'use client';
import { useState } from 'react';
import { SHARING_TYPES, type RoomType, type SharingType } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, FormError, Input, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/states';
import { api } from '@/lib/client-api';
import { SHARING_LABEL, rupees } from '@/lib/format';
import { useAction } from './use-action';

const num = (s: string) => (s === '' ? 0 : Math.max(0, Math.floor(Number(s) || 0)));

export function RoomsEditor({ hostelId, rooms, isPartner }: { hostelId: string; rooms: RoomType[]; isPartner: boolean }) {
  return (
    <div className="space-y-6">
      {rooms.length === 0 ? (
        <EmptyState title="No rooms yet">Add at least one room type with its rent and beds so seekers know what&apos;s available.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rooms.map((r) => (
            <RoomRow key={r.id} room={r} isPartner={isPartner} />
          ))}
        </div>
      )}
      <AddRoom hostelId={hostelId} existing={rooms.map((r) => r.sharing)} isPartner={isPartner} />
    </div>
  );
}

function BedsStepper({ room }: { room: RoomType }) {
  const { run, pending, error } = useAction();
  const set = (v: number) => run('beds', () => api.owner.updateRoom(room.id, { bedsAvailable: v }));
  return (
    <div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" aria-label="One fewer bed free" disabled={room.bedsAvailable <= 0 || !!pending} onClick={() => set(room.bedsAvailable - 1)}>
          −
        </Button>
        <span className="w-16 text-center text-sm">
          <strong className="text-base">{room.bedsAvailable}</strong> / {room.totalBeds}
        </span>
        <Button type="button" variant="secondary" size="sm" aria-label="One more bed free" disabled={room.bedsAvailable >= room.totalBeds || !!pending} onClick={() => set(room.bedsAvailable + 1)}>
          +
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function RoomRow({ room, isPartner }: { room: RoomType; isPartner: boolean }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ monthlyRent: String(room.monthlyRent), advanceAmount: String(room.advanceAmount), totalBeds: String(room.totalBeds) });
  const { run, pending, error, fields } = useAction();

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-semibold">{SHARING_LABEL[room.sharing]}</div>
            <div className="text-sm text-muted">
              {rupees(room.monthlyRent)}/bed/month · advance {room.advanceAmount ? rupees(room.advanceAmount) : 'none'}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="mb-1 text-xs text-muted">Beds free</div>
              <BedsStepper room={room} />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Close' : 'Edit'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                loading={pending === 'delete'}
                onClick={() => {
                  if (confirm(`Delete the ${SHARING_LABEL[room.sharing]} room type?`)) void run('delete', () => api.owner.deleteRoom(room.id));
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
        {editing && (
          <form
            className="grid gap-3 border-t border-line pt-3 sm:grid-cols-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const out = await run('save', () =>
                api.owner.updateRoom(room.id, { monthlyRent: num(f.monthlyRent), advanceAmount: num(f.advanceAmount), totalBeds: num(f.totalBeds) }),
              );
              if (out) setEditing(false);
            }}
          >
            <Field label="Rent / bed / month (₹)" error={fields.monthlyRent}>
              <Input inputMode="numeric" value={f.monthlyRent} onChange={(e) => setF({ ...f, monthlyRent: e.target.value })} />
            </Field>
            <Field label="Advance (₹)" error={fields.advanceAmount} hint={isPartner ? 'Subscribers never pay advance' : undefined}>
              <Input inputMode="numeric" value={f.advanceAmount} onChange={(e) => setF({ ...f, advanceAmount: e.target.value })} />
            </Field>
            <Field label="Total beds" error={fields.totalBeds}>
              <Input inputMode="numeric" value={f.totalBeds} onChange={(e) => setF({ ...f, totalBeds: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={pending === 'save'} className="w-full">
                Save
              </Button>
            </div>
          </form>
        )}
        <FormError message={error} />
      </CardBody>
    </Card>
  );
}

function AddRoom({ hostelId, existing, isPartner }: { hostelId: string; existing: SharingType[]; isPartner: boolean }) {
  const available = SHARING_TYPES.filter((s) => !existing.includes(s));
  const [f, setF] = useState({ sharing: (available[0] ?? '2-sharing') as SharingType, monthlyRent: '', advanceAmount: '0', totalBeds: '', bedsAvailable: '' });
  const { run, pending, error, fields } = useAction();
  if (available.length === 0) return null;
  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 text-base font-semibold">Add a room type</h2>
        <form
          className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const out = await run('add', () =>
              api.owner.addRoom(hostelId, {
                sharing: f.sharing,
                monthlyRent: num(f.monthlyRent),
                advanceAmount: num(f.advanceAmount),
                totalBeds: num(f.totalBeds),
                bedsAvailable: num(f.bedsAvailable),
              }),
            );
            if (out) setF({ ...f, monthlyRent: '', totalBeds: '', bedsAvailable: '' });
          }}
        >
          <Field label="Sharing" error={fields.sharing}>
            <Select value={f.sharing} onChange={(e) => setF({ ...f, sharing: e.target.value as SharingType })}>
              {available.map((s) => (
                <option key={s} value={s}>
                  {SHARING_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rent / bed (₹)" error={fields.monthlyRent}>
            <Input inputMode="numeric" required value={f.monthlyRent} onChange={(e) => setF({ ...f, monthlyRent: e.target.value })} />
          </Field>
          <Field label="Advance (₹)" error={fields.advanceAmount} hint={isPartner ? 'Not charged to subscribers' : undefined}>
            <Input inputMode="numeric" value={f.advanceAmount} onChange={(e) => setF({ ...f, advanceAmount: e.target.value })} />
          </Field>
          <Field label="Total beds" error={fields.totalBeds}>
            <Input inputMode="numeric" required value={f.totalBeds} onChange={(e) => setF({ ...f, totalBeds: e.target.value })} />
          </Field>
          <Field label="Beds free now" error={fields.bedsAvailable}>
            <Input inputMode="numeric" required value={f.bedsAvailable} onChange={(e) => setF({ ...f, bedsAvailable: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={pending === 'add'} className="w-full">
              Add room
            </Button>
          </div>
        </form>
        <div className="mt-3">
          <FormError message={error} />
        </div>
      </CardBody>
    </Card>
  );
}
