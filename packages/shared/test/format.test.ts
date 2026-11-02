import { describe, expect, test } from 'bun:test';
import { dateLabel, monthLabel, notCountedLabel, refundMessage, rupees, timeAgo, titleCase, weekday } from '../src/format';
import { REFUND_WITHIN_DAYS } from '../src/pricing';

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
  test('money left out of the figures is named, and nothing is said when there is none', () => {
    expect(notCountedLabel({ simulated: 0, test: 0 })).toBeNull();
    expect(notCountedLabel({ simulated: 26000, test: 0 })).toBe('Not counted: ₹26,000 simulated (no real money moved)');
    expect(notCountedLabel({ simulated: 1000, test: 1999 })).toBe('Not counted: ₹1,000 simulated · ₹1,999 Razorpay test mode (no real money moved)');
  });
  test('a late payment tells the payer what happened to their money', () => {
    const late = { amount: 10000, reason: 'bed_taken' as const, status: 'refund_due' as const, refundedAt: null, paymentMode: 'razorpay_live' as const };
    expect(refundMessage(late)).toBe(
      `We received ₹10,000, but your bed hold ran out and the last bed was taken before the payment reached us. We'll refund it to the account you paid from within ${REFUND_WITHIN_DAYS} days.`,
    );
    // Refunded at 20:00 UTC on 1 Dec is 2 Dec in India.
    expect(refundMessage({ ...late, status: 'refunded', refundedAt: '2026-12-01T20:00:00.000Z' })).toEndWith('We refunded it on 2 Dec 2026.');
    expect(refundMessage({ ...late, paymentMode: 'simulated' })).toEndWith('It was a simulated payment, so no money moved.');
  });
});
