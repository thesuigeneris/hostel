import { z } from 'zod';
import type { ISODate } from './time';
import type { Hostel, OwnerInvoice, OwnerPlanTier, PartnerStatus } from './types';

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
// Admin oversight.

export const ownerInvoiceVoidSchema = z.object({ reason: z.string().trim().min(3).max(300) });

/** Marking a payment exception refunded records how (for example the Razorpay refund id). */
export const paymentRefundSchema = z.object({ note: z.string().trim().min(3).max(300) });

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
  'partner.recheck',
  'food_partner.add',
  'food_partner.update',
  'payouts.generate',
  'payout.paid',
  'review.hide',
  'review.unhide',
  'review.keep',
  'content.hide',
  'content.unhide',
  'content.keep',
  'owner_invoice.void',
  'payment.refunded',
  'jobs.run',
  'owner.admin_action',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** How each action reads in the console. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'listing.approve': 'Listing approved',
  'listing.reject': 'Listing rejected',
  'partner.checklist': 'Partner checklist saved',
  'partner.verify': 'Partner verified',
  'partner.reject': 'Partner declined',
  'partner.fee': 'Platform fee changed',
  'partner.recheck': 'Partner checked again',
  'food_partner.add': 'Food partner added',
  'food_partner.update': 'Food partner changed',
  'payouts.generate': 'Payouts generated',
  'payout.paid': 'Payout marked paid',
  'review.hide': 'Review hidden',
  'review.unhide': 'Review shown again',
  'review.keep': 'Review kept (flags dismissed)',
  'content.hide': 'Post or comment hidden',
  'content.unhide': 'Post or comment shown again',
  'content.keep': 'Post or comment kept (reports dismissed)',
  'owner_invoice.void': 'Owner bill waived',
  'payment.refunded': 'Payment refunded',
  'jobs.run': 'Jobs run',
  'owner.admin_action': "Acted in an owner's workspace",
};

// ---------------------------------------------------------------------------
// Moderation.

/** Why an admin hides a review, post or comment (personas addendum §3: abuse, personal data, off-topic). */
export const HIDE_REASONS = ['Abusive or hateful', 'Shares personal details', 'Not about a stay (off-topic)', 'Spam or advertising'] as const;

/** A review with open flags, for the admin queue. */
export type AdminFlaggedReview = {
  review: { id: string; hostelId: string; rating: number; body: string; author: string; hidden: boolean; createdAt: string; updatedAt: string };
  hostelName: string;
  hostelSlug: string;
  flags: number;
  reasons: string[];
  firstFlaggedAt: string;
};

export type AdminHiddenReview = {
  review: { id: string; hostelId: string; rating: number; body: string; author: string; hiddenReason: string | null; updatedAt: string };
  hostelName: string;
};

/** Open reports about one post or comment. `content` is null when its author has since deleted it. */
export type AdminReport = {
  targetType: 'post' | 'comment';
  targetId: string;
  hostelId: string;
  hostelName: string;
  reports: number;
  reasons: string[];
  firstReportedAt: string;
  content: { body: string; author: string; hidden: boolean; createdAt: string } | null;
};

export type AdminHiddenContent = {
  targetType: 'post' | 'comment';
  targetId: string;
  hostelId: string;
  hostelName: string;
  body: string;
  author: string;
  createdAt: string;
};

export const moderationSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const contentTargetSchema = z.enum(['post', 'comment']);

// ---------------------------------------------------------------------------
// Material edits of live listings (edge case O3).

/** Fields whose change after approval an admin should see: who and where the listing says it is. */
export const MATERIAL_LISTING_FIELDS = {
  name: 'Name',
  address: 'Address',
  area: 'Area',
  lat: 'Map pin (latitude)',
  lng: 'Map pin (longitude)',
  genderType: 'Who can stay',
  foodAvailable: 'Food',
  contactPhone: 'Contact phone',
  whatsappPhone: 'WhatsApp',
} as const;
export type MaterialListingField = keyof typeof MATERIAL_LISTING_FIELDS;

/** A hostel as admins see it: with the partner re-check flag (set when a verified partner moved). */
export type AdminHostel = Hostel & { partnerRecheckSince: string | null };

export type ListingChange = {
  id: string;
  hostel: { id: string; name: string; slug: string; area: string; status: string; partnerStatus: PartnerStatus; recheckSince: string | null };
  /** Who saved the edit: the owner, or an admin working in the owner's workspace. Null if the account is gone. */
  changedBy: { id: string; name: string; phone: string; isOwner: boolean } | null;
  changes: { field: MaterialListingField; label: string; before: string | number | boolean | null; after: string | number | boolean | null }[];
  /** This edit moved a verified partner (address, pin, or food turned on), so its in-person check is due again. */
  partnerRecheck: boolean;
  createdAt: string;
};

/** Checking a moved partner again: the whole checklist, as for a first verification. */
export const partnerRecheckSchema = z.object({
  checklist: z.array(z.enum(PARTNER_STANDARD_IDS)).max(PARTNER_STANDARDS.length).default([]),
  note: z.string().trim().min(3).max(1000),
});

export type AuditEvent = {
  id: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  summary: string;
  actor: { id: string; name: string; phone: string } | null;
  createdAt: string;
};
