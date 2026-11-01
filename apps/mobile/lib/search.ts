import type { GenderType, SearchInput, SharingType } from '@hostels/shared';

export type Sort = 'recommended' | 'rent_asc' | 'rent_desc' | 'rating' | 'distance';

export type Filters = {
  q: string;
  area: string | null;
  verified: boolean;
  food: boolean;
  topRated: boolean;
  gender: GenderType | null;
  sharing: SharingType | null;
  minRent: number | null;
  maxRent: number | null;
  sort: Sort;
  near: { lat: number; lng: number } | null;
};

export const EMPTY_FILTERS: Filters = {
  q: '',
  area: null,
  verified: false,
  food: false,
  topRated: false,
  gender: null,
  sharing: null,
  minRent: null,
  maxRent: null,
  sort: 'recommended',
  near: null,
};

export const RENT_STEPS = [6000, 8000, 10000, 12000, 15000] as const;
export const PAGE_SIZE = 20;

/** Sorts offered on the explore screen. Distance needs a location, so it only shows once Near me is on. */
export const SORTS: { value: Sort; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'rent_asc', label: 'Rent: low to high' },
  { value: 'rent_desc', label: 'Rent: high to low' },
  { value: 'rating', label: 'Rating' },
  { value: 'distance', label: 'Distance' },
];

/** Turns the explore screen's filters into an API search. Near me limits to 5 km and sorts by distance unless another sort is picked. */
export function toSearch(f: Filters, page = 1): SearchInput {
  const s: SearchInput = { limit: PAGE_SIZE };
  if (page > 1) s.page = page;
  if (f.q.trim()) s.q = f.q.trim();
  if (f.area) s.area = f.area;
  if (f.verified) s.verified = 'true';
  if (f.food) s.food = 'true';
  if (f.topRated) s.minRating = 4;
  if (f.gender) s.gender = f.gender;
  if (f.sharing) s.sharing = f.sharing;
  if (f.minRent) s.minRent = f.minRent;
  if (f.maxRent) s.maxRent = f.maxRent;
  if (f.near) Object.assign(s, { lat: f.near.lat, lng: f.near.lng, radiusKm: 5 });
  const sort = f.sort === 'distance' && !f.near ? 'recommended' : f.near && f.sort === 'recommended' ? 'distance' : f.sort;
  if (sort !== 'recommended') s.sort = sort;
  return s;
}

export function activeFilterCount(f: Filters) {
  return [f.area, f.verified, f.food, f.topRated, f.gender, f.sharing, f.minRent, f.maxRent, f.near, f.sort !== 'recommended'].filter(Boolean).length;
}

/** Reads a rent typed into a field: digits only, empty means no limit. */
export function parseRent(text: string): number | null {
  const n = Number(text.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Whether another page of results exists after `loaded` items. */
export const hasMore = (loaded: number, total: number) => loaded < total;
