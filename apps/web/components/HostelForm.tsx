'use client';

import { AREAS, GENDER_TYPES, type Hostel } from '@hostels/shared';
import { useState } from 'react';
import { ClientPinPicker } from './MapLoader';
import { SubmitButton } from './SubmitButton';
import { Field, Input, Select, Textarea } from './ui';

const COMMON_AMENITIES = ['WiFi', 'AC', 'Hot water', 'Laundry', 'Housekeeping', 'Power backup', 'CCTV', 'Parking', 'Gym', 'Study room', 'RO water', 'Lift'];
const GENDER_LABEL: Record<string, string> = { boys: 'Boys', girls: 'Girls', coliving: 'Co-living' };
const HYDERABAD = { lat: 17.4435, lng: 78.3772 };

/** Create and edit form for a listing. The map pin fills the hidden lat/lng fields. */
export function HostelForm({ action, hostel, submitLabel }: { action: (form: FormData) => Promise<void>; hostel?: Hostel; submitLabel: string }) {
  const [pos, setPos] = useState({ lat: hostel?.lat ?? HYDERABAD.lat, lng: hostel?.lng ?? HYDERABAD.lng });
  const custom = (hostel?.amenities ?? []).filter((a) => !COMMON_AMENITIES.includes(a));

  return (
    <form action={action} className="space-y-6">
      {hostel && <input type="hidden" name="hostelId" value={hostel.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hostel name"><Input name="name" required minLength={3} maxLength={80} defaultValue={hostel?.name} placeholder="Sri Sai Comforts" /></Field>
        <Field label="Who it's for">
          <Select name="genderType" defaultValue={hostel?.genderType ?? 'boys'}>
            {GENDER_TYPES.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
          </Select>
        </Field>
        <Field label="Area">
          <Input name="area" required list="areas" defaultValue={hostel?.area} placeholder="Gachibowli" />
          <datalist id="areas">{AREAS.map((a) => <option key={a} value={a} />)}</datalist>
        </Field>
        <Field label="Street address"><Input name="address" maxLength={300} defaultValue={hostel?.address} placeholder="Plot 12, near DLF gate 2" /></Field>
        <Field label="Contact phone"><Input name="contactPhone" required inputMode="tel" defaultValue={hostel?.contactPhone} placeholder="98765 43210" /></Field>
        <Field label="WhatsApp number" hint="Leave empty if it's the same."><Input name="whatsappPhone" inputMode="tel" defaultValue={hostel?.whatsappPhone ?? ''} /></Field>
      </div>

      <Field label="Description" hint="What makes your place good to live in?">
        <Textarea name="description" maxLength={2000} defaultValue={hostel?.description} />
      </Field>

      <div>
        <div className="mb-1 text-sm font-medium">Pin the location</div>
        <p className="mb-2 text-xs text-ink-muted">Click the map or drag the pin to your gate. Tenants searching nearby find you by this point.</p>
        <ClientPinPicker lat={pos.lat} lng={pos.lng} onChange={(lat, lng) => setPos({ lat, lng })} />
        <input type="hidden" name="lat" value={pos.lat.toFixed(6)} />
        <input type="hidden" name="lng" value={pos.lng.toFixed(6)} />
        <div className="mt-1 text-xs text-ink-muted">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Amenities</legend>
        <div className="flex flex-wrap gap-2">
          {COMMON_AMENITIES.map((a) => (
            <label key={a} className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="checkbox" name="amenities" value={a} defaultChecked={hostel?.amenities.includes(a)} className="accent-brand" />
              {a}
            </label>
          ))}
        </div>
        <Input name="moreAmenities" className="mt-2" defaultValue={custom.join(', ')} placeholder="Others, separated by commas" />
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="foodAvailable" defaultChecked={hostel?.foodAvailable ?? true} className="accent-brand" />
        We serve food
      </label>

      <Field label="House rules" hint="One per line.">
        <Textarea name="rules" defaultValue={hostel?.rules.join('\n')} placeholder={'Gate closes at 11 pm\nNo smoking inside'} />
      </Field>

      <SubmitButton size="lg" pendingText="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
