import type { GenderType, SearchInput, SharingType } from '@hostels/shared';

export type Filters = {
  q: string;
  verified: boolean;
  food: boolean;
  gender: GenderType | null;
  sharing: SharingType | null;
  maxRent: number | null;
  near: { lat: number; lng: number } | null;
};

export const EMPTY_FILTERS: Filters = { q: '', verified: false, food: false, gender: null, sharing: null, maxRent: null, near: null };

export const RENT_STEPS = [6000, 8000, 10000, 12000, 15000] as const;

/** Turns the explore screen's filters into an API search. Near me sorts by distance within 5 km. */
export function toSearch(f: Filters): SearchInput {
  const s: SearchInput = { limit: 50 };
  if (f.q.trim()) s.q = f.q.trim();
  if (f.verified) s.verified = 'true';
  if (f.food) s.food = 'true';
  if (f.gender) s.gender = f.gender;
  if (f.sharing) s.sharing = f.sharing;
  if (f.maxRent) s.maxRent = f.maxRent;
  if (f.near) Object.assign(s, { lat: f.near.lat, lng: f.near.lng, radiusKm: 5, sort: 'distance' });
  return s;
}

export function activeFilterCount(f: Filters) {
  return [f.verified, f.food, f.gender, f.sharing, f.maxRent, f.near].filter(Boolean).length;
}
