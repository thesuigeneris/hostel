import type { Meal } from './enums';

/** IST is a fixed UTC+05:30 offset (no DST). */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The IST calendar date for an instant. */
export function istDate(at: Date = new Date()): IsoDate {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant of `HH:MM` IST on the given IST date. */
export function istInstant(date: IsoDate, hour: number, minute = 0): Date {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  return new Date(utcMidnight + (hour * 60 + minute) * 60 * 1000 - IST_OFFSET_MS);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * Adds calendar months, clamping to the last day of the target month
 * (Jan 31 + 1 month = Feb 28/29).
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month0 = total - year * 12;
  const day = Math.min(d, daysInMonth(year, month0));
  return `${String(year).padStart(4, '0')}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Monday of the IST week containing `date`. */
export function weekStart(date: IsoDate): IsoDate {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** `YYYY-MM` for an IST date. */
export function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

/**
 * Skip cut-offs (IST): breakfast 22:00 the night before, lunch 09:00 same day,
 * dinner 15:00 same day.
 */
export const SKIP_CUTOFFS: Record<Meal, { dayOffset: number; hour: number }> = {
  breakfast: { dayOffset: -1, hour: 22 },
  lunch: { dayOffset: 0, hour: 9 },
  dinner: { dayOffset: 0, hour: 15 },
};

/** The instant after which a meal on `date` can no longer be skipped or un-skipped. */
export function skipCutoff(date: IsoDate, meal: Meal): Date {
  const rule = SKIP_CUTOFFS[meal];
  return istInstant(addDays(date, rule.dayOffset), rule.hour);
}

export function isBeforeSkipCutoff(date: IsoDate, meal: Meal, now: Date = new Date()): boolean {
  return now.getTime() < skipCutoff(date, meal).getTime();
}

/** Billing period `n` (0-based) for a subscription that started on `startDate`. */
export function billingPeriod(startDate: IsoDate, n: number): { periodStart: IsoDate; periodEnd: IsoDate } {
  return {
    periodStart: addMonths(startDate, n),
    periodEnd: addDays(addMonths(startDate, n + 1), -1),
  };
}

/** The 0-based period index containing `date`, or -1 if before the start. */
export function periodIndexFor(startDate: IsoDate, date: IsoDate): number {
  if (date < startDate) return -1;
  let n = 0;
  while (billingPeriod(startDate, n + 1).periodStart <= date) n++;
  return n;
}

/** Bills for a period are generated this many days before the period starts. */
export const BILL_LEAD_DAYS = 5;
/** A bill unpaid this many days after its due date is overdue. */
export const OVERDUE_AFTER_DAYS = 7;

export function invoiceGenerationDate(periodStart: IsoDate): IsoDate {
  return addDays(periodStart, -BILL_LEAD_DAYS);
}

export function isOverdue(dueDate: IsoDate, today: IsoDate = istDate()): boolean {
  return daysBetween(dueDate, today) > OVERDUE_AFTER_DAYS;
}
