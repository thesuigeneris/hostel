import { AREAS, GENDER_TYPES, SHARING_TYPES } from '@hostels/shared';
import { GENDER_LABEL, SHARING_LABEL } from '@/lib/format';
import { Field, Input, Select } from './ui';

export type SearchParams = Record<string, string | undefined>;

export function SearchFilters({ q, action = '/hostels' }: { q: SearchParams; action?: string }) {
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Search">
        <Input name="q" defaultValue={q.q} placeholder="Name or street" />
      </Field>
      <Field label="Area">
        <Select name="area" defaultValue={q.area ?? ''}>
          <option value="">All areas</option>
          {AREAS.map((a) => <option key={a}>{a}</option>)}
        </Select>
      </Field>
      <Field label="Sharing">
        <Select name="sharing" defaultValue={q.sharing ?? ''}>
          <option value="">Any</option>
          {SHARING_TYPES.map((s) => <option key={s} value={s}>{SHARING_LABEL[s]}</option>)}
        </Select>
      </Field>
      <Field label="For">
        <Select name="gender" defaultValue={q.gender ?? ''}>
          <option value="">Anyone</option>
          {GENDER_TYPES.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
        </Select>
      </Field>
      <Field label="Rent from">
        <Input name="minRent" type="number" min={0} step={500} defaultValue={q.minRent} placeholder="₹" />
      </Field>
      <Field label="Rent up to">
        <Input name="maxRent" type="number" min={0} step={500} defaultValue={q.maxRent} placeholder="₹" />
      </Field>
      <Field label="Sort by">
        <Select name="sort" defaultValue={q.sort ?? 'recommended'}>
          <option value="recommended">Recommended</option>
          <option value="rent_asc">Rent: low to high</option>
          <option value="rent_desc">Rent: high to low</option>
          <option value="rating">Rating</option>
          <option value="distance">Distance (near me)</option>
        </Select>
      </Field>
      <div className="flex flex-col justify-end gap-2 text-sm text-ink-soft">
        <label className="flex items-center gap-2"><input type="checkbox" name="verified" value="true" defaultChecked={q.verified === 'true'} className="accent-brand" />Verified partners</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="food" value="true" defaultChecked={q.food === 'true'} className="accent-brand" />Food available</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="minRating" value="4" defaultChecked={q.minRating === '4'} className="accent-brand" />4★ and up</label>
      </div>
      {q.lat && <input type="hidden" name="lat" value={q.lat} />}
      {q.lng && <input type="hidden" name="lng" value={q.lng} />}
      {q.view && <input type="hidden" name="view" value={q.view} />}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className="h-10 rounded-xl bg-brand px-6 text-sm font-medium text-white hover:bg-brand-dark">Apply filters</button>
        <a href={action} className="grid h-10 place-items-center rounded-xl px-4 text-sm text-ink-soft">Clear</a>
      </div>
    </form>
  );
}
