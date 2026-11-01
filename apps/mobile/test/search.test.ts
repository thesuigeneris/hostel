import { describe, expect, test } from 'bun:test';
import { activeFilterCount, EMPTY_FILTERS, hasMore, PAGE_SIZE, parseRent, toSearch } from '../lib/search';

describe('explore filters', () => {
  test('empty filters search everything', () => {
    expect(toSearch(EMPTY_FILTERS)).toEqual({ limit: PAGE_SIZE });
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  test('each filter maps to the API query', () => {
    const f = {
      ...EMPTY_FILTERS,
      q: '  Gachibowli ',
      area: 'Madhapur',
      verified: true,
      food: true,
      topRated: true,
      gender: 'girls' as const,
      sharing: '2-sharing' as const,
      minRent: 5000,
      maxRent: 10000,
      sort: 'rent_asc' as const,
    };
    expect(toSearch(f)).toEqual({
      limit: PAGE_SIZE,
      q: 'Gachibowli',
      area: 'Madhapur',
      verified: 'true',
      food: 'true',
      minRating: 4,
      gender: 'girls',
      sharing: '2-sharing',
      minRent: 5000,
      maxRent: 10000,
      sort: 'rent_asc',
    });
    expect(activeFilterCount(f)).toBe(9);
  });

  test('pages after the first are asked for by number', () => {
    expect(toSearch(EMPTY_FILTERS, 3)).toEqual({ limit: PAGE_SIZE, page: 3 });
  });

  test('near me sorts by distance within 5 km unless another sort is picked', () => {
    const near = { ...EMPTY_FILTERS, near: { lat: 17.44, lng: 78.35 } };
    expect(toSearch(near)).toMatchObject({ lat: 17.44, lng: 78.35, radiusKm: 5, sort: 'distance' });
    expect(toSearch({ ...near, sort: 'rating' })).toMatchObject({ radiusKm: 5, sort: 'rating' });
  });

  test('distance sort without a location falls back to recommended', () => {
    expect(toSearch({ ...EMPTY_FILTERS, sort: 'distance' }).sort).toBeUndefined();
  });

  test('rent fields accept digits and treat empty as no limit', () => {
    expect(parseRent('₹ 8,000')).toBe(8000);
    expect(parseRent('')).toBeNull();
    expect(parseRent('0')).toBeNull();
  });

  test('more pages exist until every result is loaded', () => {
    expect(hasMore(20, 45)).toBe(true);
    expect(hasMore(45, 45)).toBe(false);
  });
});
