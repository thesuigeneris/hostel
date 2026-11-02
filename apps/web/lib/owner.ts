import 'server-only';
import { ApiError, type OwnerIssueSummary, type OwnerPlanTier, type OwnerSection } from '@hostels/shared';
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

/** Issues waiting over a day for the owner's answer, for the Issues tab badges. A failure only hides the badge. */
export const issueSummary = cache(async (): Promise<OwnerIssueSummary> => {
  try {
    return await (await api()).owner.issueSummary();
  } catch {
    return { needsResponse: 0, byHostel: {} };
  }
});

const RANK: Record<OwnerPlanTier, number> = { free: 0, pro: 1, partner: 2 };
export const hasPlan = (effective: OwnerPlanTier, needed: OwnerPlanTier) => RANK[effective] >= RANK[needed];

/** Where each next step on the owner's home leads, on the website. */
export function sectionHref(hostelId: string, section: OwnerSection) {
  const base = `/owner/hostels/${hostelId}`;
  return { listing: base, rooms: `${base}/rooms`, plan: `${base}/plan`, issues: `${base}/community`, dashboard: `${base}/dashboard` }[section];
}

/** "3 waiting for your reply", for screen readers next to a count badge. */
export const waitingLabel = (n: number) => `${n} ${n === 1 ? 'issue' : 'issues'} waiting for your reply`;
