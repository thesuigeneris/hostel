import { describe, expect, test } from 'bun:test';
import { activeFilterCount, EMPTY_FILTERS, toSearch } from '../lib/search';

describe('explore filters', () => {
  test('empty filters search everything', () => {
    expect(toSearch(EMPTY_FILTERS)).toEqual({ limit: 50 });
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  test('each filter maps to the API query', () => {
    const f = { ...EMPTY_FILTERS, q: '  Gachibowli ', verified: true, food: true, gender: 'girls' as const, sharing: '2-sharing' as const, maxRent: 10000 };
    expect(toSearch(f)).toEqual({ limit: 50, q: 'Gachibowli', verified: 'true', food: 'true', gender: 'girls', sharing: '2-sharing', maxRent: 10000 });
    expect(activeFilterCount(f)).toBe(5);
  });

  test('near me sorts by distance within 5 km', () => {
    const s = toSearch({ ...EMPTY_FILTERS, near: { lat: 17.44, lng: 78.35 } });
    expect(s).toMatchObject({ lat: 17.44, lng: 78.35, radiusKm: 5, sort: 'distance' });
  });
});
