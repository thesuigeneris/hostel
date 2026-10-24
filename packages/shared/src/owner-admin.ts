import { z } from 'zod';
import type { ISODate } from './time';
import type { IssueCategory, OwnerInvoice, OwnerPlanTier, PartnerStatus, PlanState, SharingType } from './types';

// ---------------------------------------------------------------------------
// Partner brand standards: what our team checks in person before a hostel carries the brand.

export const PARTNER_STANDARDS = [
  { id: 'photos_match', label: 'Photos match the rooms, bathrooms and common areas' },
  { id: 'beds_bedding', label: 'Every listed bed has a clean mattress, pillow and bedding' },
  { id: 'bathrooms', label: 'Bathrooms are clean, with running water and working geysers' },
  { id: 'drinking_water', label: 'Purified drinking water is available on every floor' },
  { id: 'kitchen_hygiene', label: 'Kitchen is clean, food is stored covered and cooks wear caps', foodOnly: true },
  { id: 'fire_safety', label: 'Fire extinguisher on each floor and a clear exit' },
  { id: 'security', label: 'CCTV or a guard at the entrance, and lockable storage per bed' },
  { id: 'wifi_power', label: 'Wi-Fi works in rooms and lights have power backup' },
  { id: 'documents', label: 'Owner ID and property papers or rental agreement checked' },
  { id: 'brand_terms', label: 'Owner agrees to Hostels signage, no-advance pricing and issue response times' },
] as const;
export type PartnerStandardId = (typeof PARTNER_STANDARDS)[number]['id'];
export const PARTNER_STANDARD_IDS = PARTNER_STANDARDS.map((s) => s.id) as [PartnerStandardId, ...PartnerStandardId[]];

/** Standards that apply to a hostel: the kitchen check only when it serves food. */
export function standardsFor(foodAvailable: boolean) {
  return PARTNER_STANDARDS.filter((s) => foodAvailable || !('foodOnly' in s && s.foodOnly));
}

export function missingStandards(foodAvailable: boolean, checked: readonly string[]) {
  return standardsFor(foodAvailable).filter((s) => !checked.includes(s.id));
}

export const partnerChecklistSchema = z.object({
  checklist: z.array(z.enum(PARTNER_STANDARD_IDS)).max(PARTNER_STANDARDS.length).default([]),
  note: z.string().trim().max(1000).default(''),
});

/** Verifying records the inspection; when a checklist is sent it must cover every standard that applies. */
export const partnerVerifySchema = z.object({
  platformFeePct: z.coerce.number().min(0).max(50).default(10),
  checklist: z.array(z.enum(PARTNER_STANDARD_IDS)).max(PARTNER_STANDARDS.length).optional(),
  note: z.string().trim().max(1000).optional(),
});

export type PartnerApplication = {
  id: string;
  hostelId: string;
  status: Exclude<PartnerStatus, 'none'>;
  checklist: PartnerStandardId[];
  note: string;
  reason: string | null;
  appliedAt: string;
  decidedAt: string | null;
};

export type AdminPartnerApplication = PartnerApplication & {
  hostel: { id: string; name: string; slug: string; area: string; status: string; foodAvailable: boolean; contactPhone: string };
  owner: { id: string; name: string; phone: string };
};

/** What a verified partner prints: signboard, poster and door sticker carry these. */
export type BrandKit = {
  hostelId: string;
  name: string;
  area: string;
  city: string;
  contactPhone: string;
  listingUrl: string;
  partnerSince: ISODate | null;
  tagline: string;
};

export type OwnerPartnerInfo = {
  standards: { id: PartnerStandardId; label: string }[];
  application: PartnerApplication | null;
};

// ---------------------------------------------------------------------------
// Owner dashboard numbers.

export type OwnerInsights = {
  hostelId: string;
  month: string;
  plan: PlanState;
  /** Pro and Partner only. */
  occupancy: {
    totalBeds: number;
    freeBeds: number;
    occupiedBeds: number;
    occupancyPct: number | null;
    activeResidents: number;
    activeSubscribers: number;
    rooms: { roomTypeId: string; sharing: SharingType; totalBeds: number; bedsAvailable: number; monthlyRent: number }[];
  } | null;
  /** Pro and Partner only. Subscription money is what tenants paid online this month; rent is the owner's own ledger. */
  revenue: {
    subscriptionGross: number;
    platformFeePct: number;
    platformFee: number;
    subscriptionNet: number;
    rentDue: number;
    rentCollected: number;
    planBillDue: number;
  } | null;
  issues: {
    open: number;
    needsResponse: number;
    openByAge: { under1Day: number; days1to3: number; days3to7: number; over7Days: number };
    byCategory: Partial<Record<IssueCategory, number>>;
    reportedLast90Days: number;
    medianHoursToFirstResponse: number | null;
    medianHoursToResolve: number | null;
  };
  reviews: { rating: number | null; count: number; awaitingReply: number };
  visits: { new: number; contacted: number };
};

// ---------------------------------------------------------------------------
// Admin oversight.

export const ownerInvoiceVoidSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export type AdminOwnerPlan = {
  id: string;
  hostelId: string;
  hostelName: string;
  area: string;
  owner: { id: string; name: string; phone: string };
  plan: OwnerPlanTier;
  pendingPlan: OwnerPlanTier | null;
  pendingPlanOn: ISODate | null;
  startDate: ISODate;
  trialEndsOn: ISODate | null;
  inTrial: boolean;
  suspended: boolean;
  partnerStatus: PartnerStatus;
  amountDue: number;
  overdueBills: number;
};

export type AdminOwnerInvoice = OwnerInvoice & { hostelName: string; ownerName: string; ownerPhone: string };

export const AUDIT_ACTIONS = [
  'listing.approve',
  'listing.reject',
  'partner.checklist',
  'partner.verify',
  'partner.reject',
  'partner.fee',
  'food_partner.add',
  'food_partner.update',
  'payouts.generate',
  'payout.paid',
  'review.hide',
  'review.unhide',
  'owner_invoice.void',
  'jobs.run',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEvent = {
  id: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  summary: string;
  actor: { id: string; name: string; phone: string } | null;
  createdAt: string;
};
