import { istDate } from '@hostels/shared';

let fixed: Date | null = null;
let offsetMs = 0;

/** The current time. Tests pin it with `setClock`; everything time-based reads it from here. */
export const clock = {
  now(): Date {
    return fixed ? new Date(fixed) : new Date(Date.now() + offsetMs);
  },
  today(): string {
    return istDate(clock.now());
  },
};

export function setClock(at: Date | string | null) {
  fixed = at === null ? null : new Date(at);
}

/**
 * Runs the clock this far ahead of real time (0 puts it back). Only the browser-test server uses it
 * (`src/e2e-server.ts`), so a journey can reach "14 days later" without waiting.
 */
export function setClockOffset(ms: number) {
  offsetMs = ms;
}
