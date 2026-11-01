import { addDays, dateLabel, isValidDate, weekday } from '@hostels/shared';

export type DayOption = { iso: string; label: string; sub: string };

/** `count` days starting at `from`, labelled for date chips: "Today", "Tomorrow", then the weekday. */
export function dayOptions(from: string, count: number, start = 0): DayOption[] {
  return Array.from({ length: count }, (_, i) => {
    const iso = addDays(from, start + i);
    const n = start + i;
    return { iso, label: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : weekday(iso), sub: dateLabel(iso).replace(/ \d{4}$/, '') };
  });
}

/** Problem with a typed date, or null when it is a real date on or after `earliest`. */
export function dateProblem(iso: string, earliest: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !isValidDate(iso)) return 'Pick a date';
  if (iso < earliest) return `Pick ${dateLabel(earliest)} or later`;
  return null;
}
