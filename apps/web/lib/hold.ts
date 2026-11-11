import { bedHold, istClockTime } from '@hostels/shared';

/** A time of day in India, as people say it: "6:42 pm". */
export const istTime = istClockTime;

/** "until 6:42 pm", or that the hold time is up. */
export function holdText(createdAt: string, now = new Date()): { ended: boolean; until: string } {
  const { ended, until } = bedHold(createdAt, now);
  return { ended, until };
}
