import { describe, expect, test } from 'bun:test';
import { phoneSchema } from '../src/schemas';
import { newId } from '../src/ids';
import { addDays, addMonths, daysBetween, istDate, isValidDate, weekStart } from '../src/time';

describe('IST dates', () => {
  test('istDate rolls over at 18:30 UTC', () => {
    expect(istDate(new Date('2026-11-09T18:29:59Z'))).toBe('2026-11-09');
    expect(istDate(new Date('2026-11-09T18:30:00Z'))).toBe('2026-11-10');
  });
  test('date arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
  });
  test('weekStart is Monday', () => {
    expect(weekStart('2026-10-24')).toBe('2026-10-19'); // Saturday
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
  });
  test('isValidDate', () => {
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-2-1')).toBe(false);
  });
});

describe('phoneSchema', () => {
  test('normalises prefixes', () => {
    expect(phoneSchema.parse('+91 98765 43210')).toBe('9876543210');
    expect(phoneSchema.parse('09876543210')).toBe('9876543210');
  });
  test('rejects non-mobile numbers', () => {
    expect(phoneSchema.safeParse('1234567890').success).toBe(false);
    expect(phoneSchema.safeParse('98765').success).toBe(false);
  });
});

describe('newId', () => {
  test('prefix and uniqueness', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId('hst')));
    expect(ids.size).toBe(1000);
    expect([...ids][0]).toMatch(/^hst_[0-9a-z]{16}$/);
  });
});
