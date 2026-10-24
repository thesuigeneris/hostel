import { AREAS, GENDER_LABEL, GENDER_TYPES, type Hostel, type HostelInput } from '@hostels/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Chip, ErrorText, Field, Row } from '@/components/ui';
import { COMMON_AMENITIES, draftFromHostel, draftToInput, type HostelDraft } from '@/lib/owner';
import { theme } from '@/lib/theme';
import { Choice, Muted, Toggle } from './parts';
import { PinPicker } from './PinPicker';

/** Create and edit form for a listing, the same fields as the website's. The map pin sets lat/lng. */
export function HostelForm({ hostel, submitLabel, busy, onSubmit }: { hostel?: Hostel | null; submitLabel: string; busy?: boolean; onSubmit: (input: HostelInput) => void }) {
  const [d, setD] = useState<HostelDraft>(() => draftFromHostel(hostel));
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof HostelDraft>(k: K, v: HostelDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  function submit() {
    const r = draftToInput(d);
    if (!r.ok) return setErr(r.error);
    setErr(null);
    onSubmit(r.value);
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Field label="Hostel name" value={d.name} onChangeText={(v) => set('name', v)} maxLength={80} placeholder="Sri Sai Comforts" />
      <Choice label="Who it's for" value={d.genderType} options={GENDER_TYPES.map((g) => ({ value: g, label: GENDER_LABEL[g] }))} onChange={(v) => set('genderType', v)} />
      <Field label="Area" value={d.area} onChangeText={(v) => set('area', v)} maxLength={60} placeholder="Gachibowli" />
      <Row>{AREAS.map((a) => <Chip key={a} label={a} active={d.area === a} onPress={() => set('area', a)} />)}</Row>
      <Field label="Street address" value={d.address} onChangeText={(v) => set('address', v)} maxLength={300} placeholder="Plot 12, near DLF gate 2" />
      <Field label="Contact phone" value={d.contactPhone} onChangeText={(v) => set('contactPhone', v)} keyboardType="phone-pad" placeholder="98765 43210" maxLength={14} />
      <Field label="WhatsApp number" hint="Leave empty if it's the same." value={d.whatsappPhone} onChangeText={(v) => set('whatsappPhone', v)} keyboardType="phone-pad" maxLength={14} />
      <Field label="Description" hint="What makes your place good to live in?" value={d.description} onChangeText={(v) => set('description', v)} multiline maxLength={2000} />

      <View style={{ gap: theme.spacing.xs }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>Pin the location</Text>
        <Muted>Tap the map or drag the pin to your gate. Tenants searching nearby find you by this point.</Muted>
        <PinPicker lat={d.lat} lng={d.lng} onChange={(lat, lng) => setD((x) => ({ ...x, lat, lng }))} />
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>Amenities</Text>
        <Row>
          {COMMON_AMENITIES.map((a) => (
            <Chip key={a} label={a} active={d.amenities.includes(a)} onPress={() => set('amenities', d.amenities.includes(a) ? d.amenities.filter((x) => x !== a) : [...d.amenities, a])} />
          ))}
        </Row>
        <Field label="Other amenities" hint="Separated by commas." value={d.moreAmenities} onChangeText={(v) => set('moreAmenities', v)} />
      </View>

      <Toggle label="We serve food" value={d.foodAvailable} onChange={(v) => set('foodAvailable', v)} />
      <Field label="House rules" hint="One per line." value={d.rules} onChangeText={(v) => set('rules', v)} multiline placeholder={'Gate closes at 11 pm\nNo smoking inside'} />
      <ErrorText>{err}</ErrorText>
      <Button title={submitLabel} busy={busy} onPress={submit} />
    </View>
  );
}
