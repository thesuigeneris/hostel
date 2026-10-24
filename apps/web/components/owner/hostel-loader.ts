import 'server-only';
import { cache } from 'react';
import { serverApi } from '@/lib/session';
import { load } from './data';

/** Owner view of one hostel, cached per request so the editor layout and tab pages share one fetch. */
export const loadOwnerHostel = cache(async (id: string) => {
  const api = await serverApi();
  return load(() => api.owner.hostel(id));
});
