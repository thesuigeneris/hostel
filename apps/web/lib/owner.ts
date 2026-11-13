import 'server-only';
import { ApiError, type OwnerPlanTier } from '@hostels/shared';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { api } from './api';

export const ownerHostel = cache(async (id: string) => {
  try {
    return await (await api()).owner.hostel(id);
  } catch (e) {
    if (e instanceof ApiError && [403, 404].includes(e.status)) notFound();
    throw e;
  }
});

const RANK: Record<OwnerPlanTier, number> = { free: 0, pro: 1, partner: 2 };
export const hasPlan = (effective: OwnerPlanTier, needed: OwnerPlanTier) => RANK[effective] >= RANK[needed];
