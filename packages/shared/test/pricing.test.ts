import { describe, expect, test } from 'bun:test';
import {
  billingPeriod,
  canChangeSkip,
  computeBill,
  computePayout,
  invoiceGenerationDate,
  isOverdue,
  periodContaining,
  planIncludesMeal,
  skipCutoff,
} from '../src/pricing';

describe('computeBill', () => {
  test('rent + food − credits', () => {
    expect(computeBill({ rent: 9000, mealPlan: 'full', skipCredits: 210 })).toEqual({
      rentAmount: 9000,
      foodAmount: 6000,
      creditAmount: 210,
      totalAmount: 14790,
    });
  });

  test('credits are capped at the food price', () => {
    expect(computeBill({ rent: 8000, mealPlan: 'two-meals', skipCredits: 9999 }).creditAmount).toBe(4500);
    expect(computeBill({ rent: 8000, mealPlan: 'none', skipCredits: 500 })).toEqual({
      rentAmount: 8000,
      foodAmount: 0,
      creditAmount: 0,
      totalAmount: 8000,
    });
  });
});

describe('plans', () => {
  test('two-meals has no lunch', () => {
    expect(planIncludesMeal('two-meals', 'lunch')).toBe(false);
    expect(planIncludesMeal('two-meals', 'dinner')).toBe(true);
    expect(planIncludesMeal('none', 'breakfast')).toBe(false);
  });
});

describe('skip cut-offs (IST)', () => {
  test('breakfast closes 22:00 IST the night before', () => {
    expect(skipCutoff('2026-11-10', 'breakfast').toISOString()).toBe('2026-11-09T16:30:00.000Z');
  });
  test('lunch 09:00 and dinner 15:00 the same day', () => {
    expect(skipCutoff('2026-11-10', 'lunch').toISOString()).toBe('2026-11-10T03:30:00.000Z');
    expect(skipCutoff('2026-11-10', 'dinner').toISOString()).toBe('2026-11-10T09:30:00.000Z');
  });
  test('canChangeSkip is strict before the cut-off', () => {
    expect(canChangeSkip('2026-11-10', 'lunch', new Date('2026-11-10T03:29:59Z'))).toBe(true);
    expect(canChangeSkip('2026-11-10', 'lunch', new Date('2026-11-10T03:30:00Z'))).toBe(false);
  });
});

describe('billing periods', () => {
  test('anchored on the start date', () => {
    expect(billingPeriod('2026-01-15', 0)).toEqual({ index: 0, start: '2026-01-15', end: '2026-02-14' });
    expect(billingPeriod('2026-01-15', 11)).toEqual({ index: 11, start: '2026-12-15', end: '2027-01-14' });
  });
  test('month-end starts clamp without drifting', () => {
    expect(billingPeriod('2026-01-31', 0).end).toBe('2026-02-27');
    expect(billingPeriod('2026-01-31', 1)).toEqual({ index: 1, start: '2026-02-28', end: '2026-03-30' });
    expect(billingPeriod('2026-01-31', 2).start).toBe('2026-03-31');
    expect(billingPeriod('2028-01-31', 1).start).toBe('2028-02-29');
  });
  test('periodContaining', () => {
    expect(periodContaining('2026-01-15', '2026-03-14').index).toBe(1);
    expect(periodContaining('2026-01-15', '2026-03-15').index).toBe(2);
    expect(periodContaining('2026-01-15', '2026-01-01').index).toBe(0);
  });
  test('next bill is generated 5 days before its period', () => {
    expect(invoiceGenerationDate('2026-03-01')).toBe('2026-02-24');
  });
});

describe('overdue', () => {
  test('more than 7 days after the due date and still due', () => {
    const inv = { status: 'due', dueDate: '2026-11-01' };
    expect(isOverdue(inv, new Date('2026-11-08T12:00:00+05:30'))).toBe(false);
    expect(isOverdue(inv, new Date('2026-11-09T00:10:00+05:30'))).toBe(true);
    expect(isOverdue({ ...inv, status: 'paid' }, new Date('2026-12-01'))).toBe(false);
  });
});

describe('payouts', () => {
  test('fee is a rounded percentage of gross', () => {
    expect(computePayout(100_000, 10)).toEqual({ grossAmount: 100_000, platformFee: 10_000, netAmount: 90_000 });
    expect(computePayout(14_795, 12.5)).toEqual({ grossAmount: 14_795, platformFee: 1849, netAmount: 12_946 });
  });
});
