import { describe, expect, test } from 'bun:test';
import { bedHold, istClockTime, type Suggestion, VISIT_STATUS_LABEL, visitNextStep } from '@hostels/shared';
import { EMPTY_FILTERS, relaxations, rentInverted, toSearch } from '../lib/search';
import { applySuggestion, latestOnly, suggestQuery } from '../lib/suggest';

describe('explore suggestions', () => {
  test('suggestions wait for two characters and send tidy text', () => {
    expect(suggestQuery(' g ')).toBeNull();
    expect(suggestQuery('  gachi   bowli ')).toBe('gachi bowli');
    expect(suggestQuery('x'.repeat(200))).toHaveLength(80);
  });

  test('an area pick becomes the area filter and clears the text; a hostel pick opens it', () => {
    const area: Suggestion = { kind: 'area', label: 'HiTech City', slug: 'hitech-city', count: 2 };
    const hostel: Suggestion = { kind: 'hostel', label: 'Habitat HiTech', slug: 'habitat-hitech', area: 'HiTech City', isVerified: true };
    const typed = { ...EMPTY_FILTERS, q: 'hite', food: true };
    expect(applySuggestion(area, typed)).toEqual({ filters: { ...typed, area: 'HiTech City', q: '' } });
    expect(applySuggestion(hostel, typed)).toEqual({ open: '/hostel/habitat-hitech' });
  });

  test('only the newest request may update the screen', () => {
    const latest = latestOnly();
    const first = latest.next();
    const second = latest.next();
    expect(latest.isCurrent(first)).toBe(false);
    expect(latest.isCurrent(second)).toBe(true);
    // "Show more" for an old filter is outdated as soon as a new search starts.
    const more = latest.next();
    const newSearch = latest.next();
    expect(latest.isCurrent(more)).toBe(false);
    expect(latest.isCurrent(newSearch)).toBe(true);
  });
});

describe('no results', () => {
  test('each filter in force can be taken off on its own', () => {
    const f = { ...EMPTY_FILTERS, q: 'zz', area: 'Madhapur', verified: true, food: true, topRated: true, gender: 'girls' as const, sharing: 'private' as const, minRent: 9000, maxRent: 4000, near: { lat: 17.4, lng: 78.3 }, sort: 'distance' as const };
    const all = relaxations(f);
    expect(all.map((r) => r.label)).toEqual([
      'Remove “zz”',
      'Remove Madhapur',
      'Remove Verified only',
      'Remove Food',
      'Remove 4★ and up',
      'Remove Girls',
      'Remove Private room',
      'Remove rent from ₹9,000',
      'Remove rent up to ₹4,000',
      'Remove Near me',
    ]);
    // Dropping "near me" also drops the distance sort, which needs a location.
    const near = all.find((r) => r.key === 'near')!;
    expect(toSearch({ ...f, ...near.patch })).not.toHaveProperty('lat');
    expect(toSearch({ ...f, ...near.patch }).sort).toBeUndefined();
    expect(relaxations(EMPTY_FILTERS)).toEqual([]);
    expect(rentInverted(f)).toBe(true);
    expect(rentInverted({ ...f, maxRent: null })).toBe(false);
  });
});

describe('visits and the bed hold, as the app shows them', () => {
  test('visit status reads in plain words with the next step', () => {
    expect(VISIT_STATUS_LABEL.new).toBe('Requested');
    expect(visitNextStep({ status: 'new', preferredDate: '2026-11-08' }, '2026-11-09')).toContain('Withdraw this request');
  });

  test('the hold ends after the shared hold time, in Indian time without time-zone data', () => {
    expect(istClockTime(new Date('2026-11-09T12:00:00Z'))).toBe('5:30 pm');
    expect(istClockTime(new Date('2026-11-09T18:45:00Z'))).toBe('12:15 am');
    expect(bedHold('2026-11-09T12:00:00Z', new Date('2026-11-09T12:10:00Z'))).toMatchObject({ ended: false, until: '6:00 pm' });
    expect(bedHold('2026-11-09T12:00:00Z', new Date('2026-11-09T12:31:00Z')).ended).toBe(true);
  });
});
