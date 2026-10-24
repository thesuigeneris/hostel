import 'server-only';
import { cache } from 'react';
import type { MyCommunity } from '@hostels/shared';
import { load } from '@/components/public/safe';
import { serverApi } from '@/lib/session';

export type MyResidency = MyCommunity['residencies'][number];

/** The viewer's residencies, cached per request so layout + page share one call. */
export const getMyResidencies = cache(async () => load((await serverApi()).community.mine()));

/** The viewer's most relevant residency at a hostel (active > pending > ended). */
export const getResidencyAt = cache(async (hostelId: string): Promise<MyResidency | null> => {
  const r = await getMyResidencies();
  if (!r.ok) return null;
  const rank = { active: 0, pending: 1, ended: 2, rejected: 3 } as const;
  return r.data.residencies.filter((x) => x.hostelId === hostelId).sort((a, b) => rank[a.status] - rank[b.status])[0] ?? null;
});
