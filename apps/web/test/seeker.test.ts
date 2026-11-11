import { describe, expect, test } from 'bun:test';
import { ApiError, PENDING_SUBSCRIPTION_TTL_MINUTES } from '@hostels/shared';
import { keepParams, moveActive, suggestionStatus } from '../lib/combobox';
import { errorText, fieldLabel, UNREACHABLE } from '../lib/errors';
import { holdText, istTime } from '../lib/hold';
import { areaOptions, areaValue, searchInput } from '../lib/search';

describe('search box suggestions', () => {
  test('arrow keys move through the list and wrap at both ends', () => {
    expect(moveActive(-1, 3, 1)).toBe(0);
    expect(moveActive(-1, 3, -1)).toBe(2);
    expect(moveActive(2, 3, 1)).toBe(0);
    expect(moveActive(0, 3, -1)).toBe(2);
    expect(moveActive(-1, 0, 1)).toBe(-1);
  });

  test('picking an area keeps the other filters, not the text, area, page or default sort', () => {
    const form: [string, string][] = [
      ['q', 'gach'],
      ['area', 'Madhapur'],
      ['sharing', '2-sharing'],
      ['minRent', ''],
      ['verified', 'true'],
      ['sort', 'recommended'],
      ['page', '3'],
      ['view', 'map'],
    ];
    expect(keepParams(form)).toBe('sharing=2-sharing&verified=true&view=map');
    expect(keepParams([['sort', 'rent_asc']])).toBe('sort=rent_asc');
  });

  test('screen readers hear how many suggestions there are, or that Enter still searches', () => {
    expect(suggestionStatus(1)).toMatch(/^1 suggestion\./);
    expect(suggestionStatus(4)).toMatch(/^4 suggestions\./);
    expect(suggestionStatus(0)).toContain('Press Enter to search');
  });
});

describe('search params', () => {
  test('the view is the page’s own and long text is cut to what the API accepts', () => {
    expect(searchInput({ q: `  ${'x'.repeat(200)}  `, view: 'map', food: 'true' })).toEqual({ q: 'x'.repeat(80), food: 'true' });
    expect(searchInput({ sharing: 'private' }, 'Madhapur')).toEqual({ sharing: 'private', area: 'Madhapur' });
    // A hand-edited page or size outside what the API serves is brought into range instead of failing the search.
    expect(searchInput({ page: '150', limit: '0' })).toEqual({ page: '100', limit: '1' });
    expect(searchInput({ page: 'two' })).toEqual({});
  });

  test('areas come from live listings, keep the one in the URL, and fall back when the API is down', () => {
    expect(areaOptions([{ area: 'Kukatpally' }, { area: 'Madhapur' }])).toEqual(['Kukatpally', 'Madhapur']);
    expect(areaOptions([{ area: 'Madhapur' }], 'Kondapur')).toEqual(['Madhapur', 'Kondapur']);
    expect(areaOptions([{ area: 'Madhapur' }], 'madhapur')).toEqual(['Madhapur']);
    expect(areaOptions(null)).toContain('Gachibowli');
    expect(areaValue(['HiTech City'], 'hitech city')).toBe('HiTech City');
  });
});

describe('form errors in plain words', () => {
  test('field problems name the field as people read it', () => {
    expect(fieldLabel('preferredDate')).toBe('Preferred date');
    expect(fieldLabel('items.0.vegDish')).toBe('Veg dish');
    const e = new ApiError(400, 'validation', 'Some fields are invalid', [{ path: 'preferredDate', message: 'Pick today or a later date' }]);
    expect(errorText(e)).toBe('Preferred date: Pick today or a later date');
    expect(errorText(new ApiError(409, 'invalid_state', 'You already have a visit request waiting at this hostel'))).toBe(
      'You already have a visit request waiting at this hostel',
    );
  });

  test('an unreachable API reads as a connection problem; real bugs are not hidden', () => {
    expect(errorText(new TypeError('fetch failed'))).toBe(UNREACHABLE);
    expect(errorText(new Error('boom'))).toBeNull();
  });
});

describe('bed hold', () => {
  test('the hold ends after the shared hold time, shown as Indian time', () => {
    const created = '2026-11-09T12:00:00.000Z'; // 5:30 pm IST
    expect(istTime(new Date(created))).toBe('5:30 pm');
    expect(holdText(created, new Date('2026-11-09T12:10:00Z'))).toEqual({ ended: false, until: PENDING_SUBSCRIPTION_TTL_MINUTES === 30 ? '6:00 pm' : expect.any(String) });
    expect(holdText(created, new Date('2026-11-09T12:30:00Z')).ended).toBe(true);
  });
});
