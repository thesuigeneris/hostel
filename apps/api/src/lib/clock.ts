import { istDate } from '@hostels/shared';

let fixed: Date | null = null;

/** The current time. Tests pin it with `setClock`; everything time-based reads it from here. */
export const clock = {
  now(): Date {
    return fixed ? new Date(fixed) : new Date();
  },
  today(): string {
    return istDate(clock.now());
  },
};

export function setClock(at: Date | string | null) {
  fixed = at === null ? null : new Date(at);
}
