export const ROLES = ['tenant', 'owner', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const SHARING_TYPES = ['private', '2-sharing', '3-sharing', '4-sharing'] as const;
export type SharingType = (typeof SHARING_TYPES)[number];

export const GENDER_TYPES = ['boys', 'girls', 'coliving'] as const;
export type GenderType = (typeof GENDER_TYPES)[number];

export const HOSTEL_STATUSES = ['draft', 'pending', 'live', 'rejected'] as const;
export type HostelStatus = (typeof HOSTEL_STATUSES)[number];

export const PARTNER_STATUSES = ['none', 'applied', 'verified', 'rejected'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const VISIT_STATUSES = ['new', 'contacted', 'closed'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_PLANS = ['full', 'two-meals', 'none'] as const;
export type MealPlan = (typeof MEAL_PLANS)[number];

export const DIETS = ['veg', 'non-veg'] as const;
export type Diet = (typeof DIETS)[number];

export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'cancelled', 'ended', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = ['due', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const MOVE_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type MoveStatus = (typeof MOVE_STATUSES)[number];

export const PAYOUT_STATUSES = ['pending', 'paid'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const ERROR_CODES = [
  'validation',
  'unauthorized',
  'forbidden',
  'not_found',
  'internal',
  'no_beds_available',
  'already_subscribed',
  'not_verified',
  'cutoff_passed',
  'meal_not_in_plan',
  'otp_invalid',
  'otp_rate_limited',
  'invoice_already_paid',
  'signature_invalid',
  'move_not_allowed',
  'conflict',
  'not_resident',
  'already_reviewed',
  'invalid_transition',
  'plan_required',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Software plan an owner pays us for, per hostel. */
export const OWNER_PLANS = ['free', 'pro'] as const;
export type OwnerPlan = (typeof OWNER_PLANS)[number];

export const SAAS_INVOICE_STATUSES = ['due', 'paid', 'void'] as const;
export type SaasInvoiceStatus = (typeof SAAS_INVOICE_STATUSES)[number];

/** How a person became a resident of a hostel. */
export const RESIDENCY_SOURCES = ['subscription', 'owner', 'claim'] as const;
export type ResidencySource = (typeof RESIDENCY_SOURCES)[number];

export const RESIDENCY_STATUSES = ['pending', 'active', 'ended', 'rejected'] as const;
export type ResidencyStatus = (typeof RESIDENCY_STATUSES)[number];

export const ISSUE_CATEGORIES = ['food', 'cleanliness', 'maintenance', 'safety', 'wifi', 'water', 'staff', 'other'] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_SEVERITIES = ['low', 'medium', 'high'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

/** open → acknowledged → in_progress → resolved → closed (resident confirms) | reopened. */
export const ISSUE_STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const POST_KINDS = ['post', 'announcement'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const REVIEW_STATUSES = ['published', 'hidden'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
