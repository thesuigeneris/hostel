'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GENDER_TYPES, type Hostel, type HostelInput } from '@hostels/shared';
import { Map } from '@/components/map';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/field';
import { api } from '@/lib/client-api';
import { GENDER_LABEL } from '@/lib/format';
import { TagInput } from './tag-input';
import { useAction } from './use-action';

const AMENITY_SUGGESTIONS = ['WiFi', 'AC', 'Laundry', 'Power backup', 'CCTV', 'Housekeeping', 'RO water', 'Gym', 'Study room', 'Parking', 'Biometric entry', 'Warden on site'];
const RULE_SUGGESTIONS = ['Gate closes at 11pm', 'No smoking inside rooms', 'Visitors allowed in the lounge till 8pm', 'No loud music after 10pm'];

type FormState = Omit<HostelInput, 'lat' | 'lng' | 'whatsappPhone' | 'amenities' | 'rules'> & {
  lat: number | null;
  lng: number | null;
  whatsappPhone: string;
  amenities: string[];
  rules: string[];
};

function initial(h?: Hostel): FormState {
  return {
    name: h?.name ?? '',
    description: h?.description ?? '',
    city: h?.city ?? 'Hyderabad',
    area: h?.area ?? '',
    address: h?.address ?? '',
    lat: h?.lat ?? null,
    lng: h?.lng ?? null,
    genderType: h?.genderType ?? 'coliving',
    amenities: h?.amenities ?? [],
    rules: h?.rules ?? [],
    contactPhone: h?.contactPhone ?? '',
    whatsappPhone: h?.whatsappPhone ?? '',
    foodAvailable: h?.foodAvailable ?? true,
  };
}

/** Create (no `hostel`) or edit a hostel's details, including the map pin. */
export function HostelForm({ hostel }: { hostel?: Hostel }) {
  const router = useRouter();
  const [f, setF] = useState<FormState>(() => initial(hostel));
  const [saved, setSaved] = useState(false);
  const { run, pending, error, fields, setError } = useAction();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setSaved(false);
    setF((s) => ({ ...s, [k]: v }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.lat === null || f.lng === null) {
      setError('Drop a pin on the map so seekers can find you.');
      return;
    }
    const input: HostelInput = { ...f, lat: f.lat, lng: f.lng, whatsappPhone: f.whatsappPhone.trim() ? f.whatsappPhone : null };
    if (hostel) {
      const out = await run('save', () => api.owner.updateHostel(hostel.id, input));
      if (out) setSaved(true);
    } else {
      const out = await run('save', () => api.owner.createHostel(input), { refresh: false });
      if (out) router.push(`/owner/hostels/${out.id}/rooms`);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Hostel name" error={fields.name} className="sm:col-span-2">
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} required placeholder="Sunrise Residency" />
          </Field>
          <Field label="Description" error={fields.description} hint="What makes your place good to live in? Food, safety, location." className="sm:col-span-2">
            <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={4} />
          </Field>
          <Field label="Who can stay" error={fields.genderType}>
            <Select value={f.genderType} onChange={(e) => set('genderType', e.target.value as FormState['genderType'])}>
              {GENDER_TYPES.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABEL[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Food" error={fields.foodAvailable}>
            <Select value={f.foodAvailable ? 'yes' : 'no'} onChange={(e) => set('foodAvailable', e.target.value === 'yes')}>
              <option value="yes">We serve food</option>
              <option value="no">No food</option>
            </Select>
          </Field>
          <Field label="Contact phone" error={fields.contactPhone}>
            <Input value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} required inputMode="tel" placeholder="98480 12345" />
          </Field>
          <Field label="WhatsApp number" error={fields.whatsappPhone} hint="Optional">
            <Input value={f.whatsappPhone} onChange={(e) => set('whatsappPhone', e.target.value)} inputMode="tel" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <h2 className="text-base font-semibold sm:col-span-2">Location</h2>
          <Field label="City" error={fields.city}>
            <Input value={f.city} onChange={(e) => set('city', e.target.value)} required />
          </Field>
          <Field label="Area / locality" error={fields.area}>
            <Input value={f.area} onChange={(e) => set('area', e.target.value)} required placeholder="Gachibowli" />
          </Field>
          <Field label="Full address" error={fields.address} className="sm:col-span-2">
            <Input value={f.address} onChange={(e) => set('address', e.target.value)} required />
          </Field>
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium">Map pin</span>
              <span className="text-xs text-muted">
                {f.lat !== null && f.lng !== null ? `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}` : 'Click the map to drop a pin on your gate'}
              </span>
            </div>
            <div className="h-72">
              <Map
                onPick={(lat, lng) => {
                  set('lat', lat);
                  set('lng', lng);
                }}
                picked={f.lat !== null && f.lng !== null ? { lat: f.lat, lng: f.lng } : null}
                zoom={f.lat !== null ? 16 : 12}
              />
            </div>
            {(fields.lat || fields.lng) && <p className="mt-1 text-xs text-danger">{fields.lat ?? fields.lng}</p>}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Amenities" error={fields.amenities}>
            <TagInput value={f.amenities} onChange={(v) => set('amenities', v)} placeholder="Type and press Enter" suggestions={AMENITY_SUGGESTIONS} />
          </Field>
          <Field label="House rules" error={fields.rules}>
            <TagInput value={f.rules} onChange={(v) => set('rules', v)} placeholder="Type and press Enter" suggestions={RULE_SUGGESTIONS} maxLength={200} />
          </Field>
        </CardBody>
      </Card>

      <FormError message={error} />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending === 'save'}>
          {hostel ? 'Save changes' : 'Create listing'}
        </Button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
    </form>
  );
}
