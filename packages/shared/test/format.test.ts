import { describe, expect, test } from 'bun:test';
import { dateLabel, monthLabel, rupees, timeAgo, titleCase, weekday } from '../src/format';

describe('format', () => {
  test('rupees use Indian grouping', () => {
    expect(rupees(150000)).toBe('₹1,50,000');
    expect(rupees(null)).toBe('—');
  });
  test('dates', () => {
    expect(dateLabel('2026-11-09')).toBe('9 Nov 2026');
    expect(dateLabel('2026-11-09T10:00:00Z')).toBe('9 Nov 2026');
    expect(monthLabel('2026-02')).toBe('Feb 2026');
    expect(weekday('2026-11-09')).toBe('Mon');
  });
  test('timeAgo and titleCase', () => {
    const now = Date.parse('2026-11-09T12:00:00Z');
    expect(timeAgo('2026-11-09T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-11-09T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-07T12:00:00Z', now)).toBe('2 d ago');
    expect(titleCase('lost_found')).toBe('Lost Found');
  });
});
