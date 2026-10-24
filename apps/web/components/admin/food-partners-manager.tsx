'use client';
import { useState } from 'react';
import type { FoodPartner } from '@hostels/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, FormError, Input } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/states';
import { useAction } from '@/components/owner/use-action';
import { api } from '@/lib/client-api';

type Draft = { name: string; cuisine: string; logoUrl: string };

export function FoodPartnersManager({ partners }: { partners: FoodPartner[] }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <h2 className="mb-3 font-semibold">Add a food partner</h2>
          <PartnerForm />
        </CardBody>
      </Card>
      {partners.length === 0 ? (
        <EmptyState title="No food partners yet">Partner brands can be scheduled into hostel menus by partner owners.</EmptyState>
      ) : (
        <div className="space-y-2">
          {partners.map((p) => (
            <PartnerRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerForm({ partner, onDone }: { partner?: FoodPartner; onDone?: () => void }) {
  const [f, setF] = useState<Draft>({ name: partner?.name ?? '', cuisine: partner?.cuisine ?? '', logoUrl: partner?.logoUrl ?? '' });
  const { run, pending, error, fields } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = { name: f.name, cuisine: f.cuisine, logoUrl: f.logoUrl.trim() || null };
        const out = await run('save', () => (partner ? api.admin.updateFoodPartner(partner.id, input) : api.admin.createFoodPartner({ ...input, active: true })));
        if (out) {
          if (!partner) setF({ name: '', cuisine: '', logoUrl: '' });
          onDone?.();
        }
      }}
    >
      <Field label="Name" error={fields.name}>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      </Field>
      <Field label="Cuisine" error={fields.cuisine}>
        <Input value={f.cuisine} onChange={(e) => setF({ ...f, cuisine: e.target.value })} required />
      </Field>
      <Field label="Logo URL" error={fields.logoUrl} hint="Optional">
        <Input value={f.logoUrl} onChange={(e) => setF({ ...f, logoUrl: e.target.value })} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" className="w-full" loading={pending === 'save'}>
          {partner ? 'Save' : 'Add partner'}
        </Button>
      </div>
      <div className="sm:col-span-4">
        <FormError message={error} />
      </div>
    </form>
  );
}

function PartnerRow({ p }: { p: FoodPartner }) {
  const [editing, setEditing] = useState(false);
  const { run, pending, error } = useAction();
  return (
    <Card>
      <CardBody className="space-y-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-food-soft text-sm font-semibold text-food">
              {p.logoUrl ? <img src={p.logoUrl} alt="" className="h-full w-full object-cover" /> : p.name.slice(0, 2)}
            </div>
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted">{p.cuisine}</div>
            </div>
            {p.active ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Close' : 'Edit'}
            </Button>
            <Button size="sm" variant="secondary" loading={!!pending} onClick={() => run('toggle', () => api.admin.updateFoodPartner(p.id, { active: !p.active }))}>
              {p.active ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {editing && (
          <div className="border-t border-line pt-3">
            <PartnerForm partner={p} onDone={() => setEditing(false)} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
