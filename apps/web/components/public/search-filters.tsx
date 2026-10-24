'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { GENDER_TYPES, SHARING_TYPES } from '@hostels/shared';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { GENDER_LABEL, SHARING_LABEL } from '@/lib/format';
import { useGeolocate } from './search-box';

const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'distance', label: 'Nearest' },
];

/** Filter form whose state lives in the URL, so results are server-rendered and shareable. */
export function SearchFilters({ areas }: { areas: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const geo = useGeolocate();

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const get = (k: string) => params.get(k) ?? '';
  const hasLocation = !!params.get('lat');

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get('q') as string;
          update({ q: q.trim() || null });
        }}
      >
        <Input name="q" defaultValue={get('q')} placeholder="Search hostel or area" aria-label="Search" key={get('q')} />
        <Button type="submit" loading={pending}>Search</Button>
        <Button type="button" variant="secondary" className="lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Filters
        </Button>
      </form>

      <div className={`${open ? 'grid' : 'hidden'} mt-4 gap-4 sm:grid-cols-2 lg:grid lg:grid-cols-4`}>
        <Field label="Area">
          <Select value={get('area')} onChange={(e) => update({ area: e.target.value || null })}>
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </Field>
        <Field label="Room">
          <Select value={get('sharing')} onChange={(e) => update({ sharing: e.target.value || null })}>
            <option value="">Any sharing</option>
            {SHARING_TYPES.map((s) => (
              <option key={s} value={s}>{SHARING_LABEL[s]}</option>
            ))}
          </Select>
        </Field>
        <Field label="For">
          <Select value={get('gender')} onChange={(e) => update({ gender: e.target.value || null })}>
            <option value="">Everyone</option>
            {GENDER_TYPES.map((g) => (
              <option key={g} value={g}>{GENDER_LABEL[g]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sort by">
          <Select
            value={get('sort') || 'recommended'}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'distance' && !hasLocation) geo.locate((lat, lng) => update({ sort: 'distance', lat: String(lat), lng: String(lng) }));
              else update({ sort: v === 'recommended' ? null : v });
            }}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Min rent (₹)">
          <Input type="number" inputMode="numeric" min={0} step={500} defaultValue={get('minRent')} key={`min${get('minRent')}`} onBlur={(e) => e.target.value !== get('minRent') && update({ minRent: e.target.value || null })} />
        </Field>
        <Field label="Max rent (₹)">
          <Input type="number" inputMode="numeric" min={0} step={500} defaultValue={get('maxRent')} key={`max${get('maxRent')}`} onBlur={(e) => e.target.value !== get('maxRent') && update({ maxRent: e.target.value || null })} />
        </Field>
        <div className="flex flex-col justify-end gap-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={get('verified') === 'true'} onChange={(e) => update({ verified: e.target.checked ? 'true' : null })} />
            Verified partners only (no advance)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-food)]" checked={get('food') === 'true'} onChange={(e) => update({ food: e.target.checked ? 'true' : null })} />
            Food available
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {hasLocation ? (
          <button type="button" className="text-brand underline" onClick={() => update({ lat: null, lng: null, sort: null })}>
            Clear my location
          </button>
        ) : (
          <button type="button" className="text-brand underline" onClick={() => geo.locate((lat, lng) => update({ lat: String(lat), lng: String(lng), sort: 'distance' }))}>
            {geo.locating ? 'Finding you…' : 'Use my location'}
          </button>
        )}
        {params.toString() && (
          <button type="button" className="text-muted underline" onClick={() => startTransition(() => router.push(pathname))}>
            Reset filters
          </button>
        )}
        {geo.error && <span className="text-danger">{geo.error}</span>}
      </div>
    </div>
  );
}
