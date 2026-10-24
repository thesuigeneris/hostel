import { describe, expect, test } from 'bun:test';
import { addMonths, billingPeriod, isBeforeSkipCutoff, isOverdue, istDate, periodIndexFor, skipCutoff, weekStart } from '../src/time';
import { billAmounts, cappedCredit, payoutAmounts } from '../src/pricing';
import { newId } from '../src/ids';
import { schemas } from '../src';

describe('time', () => {
  test('istDate rolls over at 18:30 UTC', () => {
    expect(istDate(new Date('2026-10-24T18:29:00Z'))).toBe('2026-10-24');
    expect(istDate(new Date('2026-10-24T18:30:00Z'))).toBe('2026-10-25');
  });
  test('addMonths clamps to month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
  test('billing periods', () => {
    expect(billingPeriod('2026-10-10', 0)).toEqual({ periodStart: '2026-10-10', periodEnd: '2026-11-09' });
    expect(billingPeriod('2026-10-10', 2)).toEqual({ periodStart: '2026-12-10', periodEnd: '2027-01-09' });
    expect(periodIndexFor('2026-10-10', '2026-11-09')).toBe(0);
    expect(periodIndexFor('2026-10-10', '2026-11-10')).toBe(1);
    expect(periodIndexFor('2026-10-10', '2026-10-01')).toBe(-1);
  });
  test('skip cut-offs in IST', () => {
    expect(skipCutoff('2026-10-25', 'breakfast').toISOString()).toBe('2026-10-24T16:30:00.000Z');
    expect(skipCutoff('2026-10-25', 'lunch').toISOString()).toBe('2026-10-25T03:30:00.000Z');
    expect(skipCutoff('2026-10-25', 'dinner').toISOString()).toBe('2026-10-25T09:30:00.000Z');
    expect(isBeforeSkipCutoff('2026-10-25', 'lunch', new Date('2026-10-25T03:29:59Z'))).toBe(true);
    expect(isBeforeSkipCutoff('2026-10-25', 'lunch', new Date('2026-10-25T03:30:00Z'))).toBe(false);
  });
  test('weekStart is Monday', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
  });
  test('overdue after 7 days', () => {
    expect(isOverdue('2026-10-01', '2026-10-08')).toBe(false);
    expect(isOverdue('2026-10-01', '2026-10-09')).toBe(true);
  });
});

describe('pricing', () => {
  test('credit is capped at food price', () => {
    expect(cappedCredit('two-meals', 9999)).toBe(4500);
    expect(cappedCredit('none', 100)).toBe(0);
  });
  test('bill amounts', () => {
    expect(billAmounts({ rent: 9000, plan: 'full', skipCredits: 210 })).toEqual({
      rentAmount: 9000,
      foodAmount: 6000,
      creditAmount: 210,
      totalAmount: 14790,
    });
  });
  test('payout maths', () => {
    expect(payoutAmounts(100_000, 10)).toEqual({ grossAmount: 100_000, platformFee: 10_000, netAmount: 90_000 });
  });
});

describe('ids & schemas', () => {
  test('newId has prefix', () => {
    expect(newId('hst')).toMatch(/^hst_[0-9a-z]{16}$/);
  });
  test('phone normalisation', () => {
    expect(schemas.phone.parse('+91 98765-43210')).toBe('9876543210');
    expect(schemas.phone.safeParse('12345').success).toBe(false);
  });
});
