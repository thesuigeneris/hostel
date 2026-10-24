'use client';
import { useEffect, useState } from 'react';
import { istDate, monthOf, type OwnerPlan, type RentPayment, type ResidencyWithPeople } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, FormError, Input } from '@/components/ui/field';
import { EmptyState, Spinner } from '@/components/ui/states';
import { api } from '@/lib/client-api';
import { describeError } from '@/lib/errors';
import { formatDate, rupees } from '@/lib/format';
import { ProGate } from './ui';
import { useAction } from './use-action';

const SOURCE_LABEL = { subscription: 'Subscriber', owner: 'Added by you', claim: 'Self-claimed' } as const;

export function ResidentsManager({ hostelId, plan, residents }: { hostelId: string; plan: OwnerPlan; residents: ResidencyWithPeople[] }) {
  const pending = residents.filter((r) => r.status === 'pending');
  const active = residents.filter((r) => r.status === 'active');
  const past = residents.filter((r) => r.status === 'ended');

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Waiting for approval ({pending.length})</h2>
          <p className="mb-3 text-sm text-muted">These people say they live here. Approve them so they can join your board, report issues and review.</p>
          <div className="space-y-2">
            {pending.map((r) => (
              <PendingRow key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Current residents ({active.length})</h2>
        {active.length === 0 ? (
          <EmptyState title="No residents yet">Residents appear when tenants subscribe, when you approve a claim, or when you add them.</EmptyState>
        ) : (
          <div className="space-y-2">
            {active.map((r) => (
              <ActiveRow key={r.id} r={r} plan={plan} hostelId={hostelId} />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardBody>
          <h2 className="mb-3 font-semibold">Add a resident</h2>
          <ProGate plan={plan} hostelId={hostelId} feature="Resident register">
            <AddResidentForm hostelId={hostelId} />
          </ProGate>
        </CardBody>
      </Card>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Past residents ({past.length})</h2>
          <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface text-sm">
            {past.map((r) => (
              <div key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <span>{r.user.name || `+91 ${r.user.phone}`}</span>
                <span className="text-muted">
                  {formatDate(r.startDate)} – {formatDate(r.endDate)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Person({ r }: { r: ResidencyWithPeople }) {
  return (
    <div className="min-w-0">
      <div className="font-medium">{r.user.name || 'Resident'}</div>
      <div className="text-xs text-muted">
        +91 {r.user.phone} · since {formatDate(r.startDate)}
        {r.roomLabel && ` · Room ${r.roomLabel}`}
      </div>
    </div>
  );
}

function PendingRow({ r }: { r: ResidencyWithPeople }) {
  const { run, pending, error } = useAction();
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-3 py-3">
        <Person r={r} />
        <div className="flex gap-2">
          <Button size="sm" loading={pending === 'active'} onClick={() => run('active', () => api.owner.decideResidency(r.id, { status: 'active' }))}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" loading={pending === 'rejected'} onClick={() => run('rejected', () => api.owner.decideResidency(r.id, { status: 'rejected' }))}>
            Reject
          </Button>
        </div>
        {error && <p className="w-full text-xs text-danger">{error}</p>}
      </CardBody>
    </Card>
  );
}

function ActiveRow({ r, plan, hostelId }: { r: ResidencyWithPeople; plan: OwnerPlan; hostelId: string }) {
  const [open, setOpen] = useState(false);
  const { run, pending, error } = useAction();
  return (
    <Card>
      <CardBody className="space-y-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Person r={r} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{SOURCE_LABEL[r.source]}</Badge>
            {r.monthlyRent !== null && <Badge tone="brand">{rupees(r.monthlyRent)}/mo</Badge>}
            <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide rent' : 'Rent ledger'}
            </Button>
            {r.source !== 'subscription' && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                loading={pending === 'end'}
                onClick={() => {
                  if (confirm(`Mark ${r.user.name || 'this resident'} as moved out today?`))
                    void run('end', () => api.owner.decideResidency(r.id, { status: 'ended', endDate: istDate() }));
                }}
              >
                Moved out
              </Button>
            )}
          </div>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {open && (
          <div className="border-t border-line pt-3">
            <ProGate plan={plan} hostelId={hostelId} feature="Rent ledger">
              {plan === 'pro' ? <RentLedger residencyId={r.id} defaultAmount={r.monthlyRent} /> : <LedgerPreview />}
            </ProGate>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function LedgerPreview() {
  return (
    <div className="space-y-1 text-sm">
      {['2026-08', '2026-09', '2026-10'].map((m) => (
        <div key={m} className="flex justify-between">
          <span>{m}</span>
          <span>₹9,000 paid</span>
        </div>
      ))}
    </div>
  );
}

function RentLedger({ residencyId, defaultAmount }: { residencyId: string; defaultAmount: number | null }) {
  const [items, setItems] = useState<RentPayment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [f, setF] = useState({ periodMonth: monthOf(istDate()), amount: defaultAmount ? String(defaultAmount) : '', paidOn: istDate(), note: '' });
  const { run, pending, error, fields } = useAction();

  async function refresh() {
    try {
      setItems(await api.owner.rentLedger(residencyId));
      setLoadError(null);
    } catch (e) {
      setLoadError(describeError(e).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, [residencyId]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-medium">Payments</h3>
        {loadError ? (
          <p className="text-sm text-danger">{loadError}</p>
        ) : items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {items.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-1.5">
                <span>
                  {p.periodMonth}
                  {p.note && <span className="text-muted"> · {p.note}</span>}
                </span>
                <span>
                  {rupees(p.amount)} <span className="text-xs text-muted">on {formatDate(p.paidOn)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const out = await run(
            'rent',
            () => api.owner.recordRent(residencyId, { periodMonth: f.periodMonth, amount: Math.max(0, Math.floor(Number(f.amount) || 0)), paidOn: f.paidOn, note: f.note }),
            { refresh: false },
          );
          if (out) {
            setF({ ...f, note: '' });
            void refresh();
          }
        }}
      >
        <Field label="Month" error={fields.periodMonth}>
          <Input type="month" value={f.periodMonth} onChange={(e) => setF({ ...f, periodMonth: e.target.value })} required />
        </Field>
        <Field label="Amount (₹)" error={fields.amount}>
          <Input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        </Field>
        <Field label="Paid on" error={fields.paidOn}>
          <Input type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} required />
        </Field>
        <Field label="Note" error={fields.note}>
          <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="UPI / cash" />
        </Field>
        <div className="col-span-2">
          <FormError message={error} />
          <Button type="submit" size="sm" className="mt-2" loading={pending === 'rent'}>
            Record payment
          </Button>
        </div>
      </form>
    </div>
  );
}

function AddResidentForm({ hostelId }: { hostelId: string }) {
  const [f, setF] = useState({ phone: '', name: '', startDate: istDate(), roomLabel: '', monthlyRent: '' });
  const { run, pending, error, fields } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const out = await run('add', () =>
          api.owner.addResident(hostelId, {
            phone: f.phone,
            name: f.name,
            startDate: f.startDate,
            roomLabel: f.roomLabel || undefined,
            monthlyRent: f.monthlyRent ? Math.max(0, Math.floor(Number(f.monthlyRent))) : undefined,
          }),
        );
        if (out) setF({ ...f, phone: '', name: '', roomLabel: '', monthlyRent: '' });
      }}
    >
      <Field label="Phone" error={fields.phone}>
        <Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
      </Field>
      <Field label="Name" error={fields.name}>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      </Field>
      <Field label="Moved in" error={fields.startDate}>
        <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} required />
      </Field>
      <Field label="Room" error={fields.roomLabel}>
        <Input value={f.roomLabel} onChange={(e) => setF({ ...f, roomLabel: e.target.value })} placeholder="204-B" />
      </Field>
      <Field label="Rent / month (₹)" error={fields.monthlyRent}>
        <Input inputMode="numeric" value={f.monthlyRent} onChange={(e) => setF({ ...f, monthlyRent: e.target.value })} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" className="w-full" loading={pending === 'add'}>
          Add
        </Button>
      </div>
      <div className="sm:col-span-3 lg:col-span-6">
        <FormError message={error} />
      </div>
    </form>
  );
}
