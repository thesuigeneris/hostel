/**
 * Calendar helpers. A calendar date is an IST date written `YYYY-MM-DD`.
 * IST is UTC+05:30 with no daylight saving, so the offset is fixed.
 */

export type ISODate = string;

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: ISODate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`invalid date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fromUtcMidnight(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidDate(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** The IST calendar date of an instant. */
export function istDate(at: Date = new Date()): ISODate {
  return fromUtcMidnight(at.getTime() + IST_OFFSET_MS);
}

/** The instant at hh:mm IST on a calendar date. */
export function istInstant(date: ISODate, hour: number, minute = 0): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MS);
}

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = parts(date);
  return fromUtcMidnight(Date.UTC(y, m - 1, d) + days * DAY_MS);
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = parts(date);
  const targetMonth = m - 1 + months;
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  return fromUtcMidnight(Date.UTC(y, targetMonth, Math.min(d, lastDay)));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** Monday of the week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  const [y, m, d] = parts(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function isMonday(date: ISODate): boolean {
  return weekStart(date) === date;
}

/** `YYYY-MM` of a calendar date. */
export function monthOf(date: ISODate): string {
  return date.slice(0, 7);
}
