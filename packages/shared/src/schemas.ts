import { z } from 'zod';
import {
  DIETS,
  GENDER_TYPES,
  HOSTEL_STATUSES,
  INVOICE_STATUSES,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  MEAL_PLANS,
  MEALS,
  MOVE_STATUSES,
  OWNER_PLANS,
  PARTNER_STATUSES,
  PAYOUT_STATUSES,
  POST_KINDS,
  RESIDENCY_SOURCES,
  RESIDENCY_STATUSES,
  REVIEW_STATUSES,
  ROLES,
  SAAS_INVOICE_STATUSES,
  SHARING_TYPES,
  SUBSCRIPTION_STATUSES,
  VISIT_STATUSES,
} from './enums';
import { isIsoDate } from './time';

// ---------- primitives ----------

export const isoDate = z.string().refine(isIsoDate, 'Expected a date as YYYY-MM-DD');
/** Indian mobile number, 10 digits, optional +91 prefix stripped by callers. */
export const phone = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, '').replace(/^\+?91(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'));
export const rupees = z.number().int().min(0).max(10_000_000);
export const timestamp = z.string(); // ISO-8601 UTC

export const role = z.enum(ROLES);
export const sharingType = z.enum(SHARING_TYPES);
export const genderType = z.enum(GENDER_TYPES);
export const hostelStatus = z.enum(HOSTEL_STATUSES);
export const partnerStatus = z.enum(PARTNER_STATUSES);
export const visitStatus = z.enum(VISIT_STATUSES);
export const meal = z.enum(MEALS);
export const mealPlan = z.enum(MEAL_PLANS);
export const diet = z.enum(DIETS);
export const subscriptionStatus = z.enum(SUBSCRIPTION_STATUSES);
export const invoiceStatus = z.enum(INVOICE_STATUSES);
export const moveStatus = z.enum(MOVE_STATUSES);
export const payoutStatus = z.enum(PAYOUT_STATUSES);
export const ownerPlan = z.enum(OWNER_PLANS);
export const saasInvoiceStatus = z.enum(SAAS_INVOICE_STATUSES);
export const residencySource = z.enum(RESIDENCY_SOURCES);
export const residencyStatus = z.enum(RESIDENCY_STATUSES);
export const issueCategory = z.enum(ISSUE_CATEGORIES);
export const issueSeverity = z.enum(ISSUE_SEVERITIES);
export const issueStatus = z.enum(ISSUE_STATUSES);
export const postKind = z.enum(POST_KINDS);
export const reviewStatus = z.enum(REVIEW_STATUSES);

export const apiError = z.object({
  error: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });

// ---------- users & auth ----------

export const user = z.object({
  id: z.string(),
  phone: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role,
  createdAt: timestamp,
});

/** What other residents see about a person. Never includes phone. */
export const publicUser = z.object({ id: z.string(), name: z.string() });

export const otpRequestInput = z.object({ phone });
export const otpRequestResult = z.object({ ok: z.literal(true), devOtp: z.string().optional() });
export const otpVerifyInput = z.object({
  phone,
  otp: z.string().regex(/^\d{6}$/),
  /** Only used when creating a new account. `admin` is never accepted. */
  role: z.enum(['tenant', 'owner']).optional(),
  name: z.string().trim().max(80).optional(),
});
export const authSession = z.object({ user, token: z.string(), expiresAt: timestamp });

export const updateMeInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().nullable().optional(),
});

// ---------- hostels ----------

export const roomType = z.object({
  id: z.string(),
  hostelId: z.string(),
  sharing: sharingType,
  monthlyRent: rupees,
  advanceAmount: rupees,
  totalBeds: z.number().int().min(0),
  bedsAvailable: z.number().int().min(0),
});

export const hostelPhoto = z.object({ id: z.string(), hostelId: z.string(), url: z.string(), sortOrder: z.number().int() });

export const ratingSummary = z.object({
  count: z.number().int(),
  overall: z.number().nullable(), // 1-5, one decimal; null when no reviews
  food: z.number().nullable(),
  cleanliness: z.number().nullable(),
  safety: z.number().nullable(),
  value: z.number().nullable(),
  staff: z.number().nullable(),
});

/** Public transparency numbers about how a hostel handles resident issues. */
export const issueStats = z.object({
  last90Days: z.number().int(),
  resolved: z.number().int(),
  open: z.number().int(),
  /** Median hours from report to resolved, null when nothing resolved yet. */
  medianResolutionHours: z.number().nullable(),
  /** Median hours from report to first owner response (acknowledged or comment). */
  medianResponseHours: z.number().nullable(),
});

export const hostelSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  area: z.string(),
  lat: z.number(),
  lng: z.number(),
  genderType,
  foodAvailable: z.boolean(),
  partnerStatus,
  ownerPlan,
  coverPhotoUrl: z.string().nullable(),
  minRent: rupees.nullable(),
  sharingTypes: z.array(sharingType),
  bedsAvailable: z.number().int(),
  rating: z.number().nullable(),
  reviewCount: z.number().int(),
  /** Only present when the search was given lat/lng. */
  distanceKm: z.number().optional(),
});

export const hostel = z.object({
  id: z.string(),
  ownerId: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  city: z.string(),
  area: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  genderType,
  amenities: z.array(z.string()),
  rules: z.array(z.string()),
  contactPhone: z.string(),
  whatsappPhone: z.string().nullable(),
  foodAvailable: z.boolean(),
  status: hostelStatus,
  rejectionReason: z.string().nullable(),
  partnerStatus,
  platformFeePct: z.number().int(),
  ownerPlan,
  createdAt: timestamp,
});

export const hostelDetail = hostel.extend({
  photos: z.array(hostelPhoto),
  roomTypes: z.array(roomType),
  rating: ratingSummary,
  issueStats,
});

export const hostelSearchQuery = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  minRent: z.coerce.number().int().optional(),
  maxRent: z.coerce.number().int().optional(),
  sharing: sharingType.optional(),
  gender: genderType.optional(),
  food: z.coerce.boolean().optional(),
  verified: z.coerce.boolean().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  sort: z.enum(['recommended', 'price_asc', 'price_desc', 'rating', 'distance']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

export const areaSummary = z.object({ city: z.string(), area: z.string(), slug: z.string(), hostelCount: z.number().int(), minRent: rupees.nullable() });

export const hostelInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(4000).default(''),
  city: z.string().trim().min(2).max(60),
  area: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  genderType,
  amenities: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
  rules: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
  contactPhone: phone,
  whatsappPhone: phone.nullable().optional(),
  foodAvailable: z.boolean().default(false),
});
export const hostelUpdateInput = hostelInput.partial();

export const roomTypeInput = z
  .object({
    sharing: sharingType,
    monthlyRent: rupees,
    advanceAmount: rupees.default(0),
    totalBeds: z.number().int().min(1).max(1000),
    bedsAvailable: z.number().int().min(0).max(1000),
  })
  .refine((r) => r.bedsAvailable <= r.totalBeds, { message: 'Beds free cannot exceed total beds', path: ['bedsAvailable'] });
export const roomTypeUpdateInput = z.object({
  monthlyRent: rupees.optional(),
  advanceAmount: rupees.optional(),
  totalBeds: z.number().int().min(1).max(1000).optional(),
  bedsAvailable: z.number().int().min(0).max(1000).optional(),
});

export const addPhotoInput = z.object({ url: z.string().min(1), sortOrder: z.number().int().optional() });
export const reorderPhotosInput = z.object({ photoIds: z.array(z.string()).min(1) });
export const uploadResult = z.object({ url: z.string() });

// ---------- visits ----------

export const visitRequest = z.object({
  id: z.string(),
  hostelId: z.string(),
  userId: z.string(),
  preferredDate: isoDate,
  message: z.string(),
  status: visitStatus,
  createdAt: timestamp,
});
export const visitRequestWithPeople = visitRequest.extend({
  hostel: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  user: z.object({ id: z.string(), name: z.string(), phone: z.string() }),
});
export const visitRequestInput = z.object({ preferredDate: isoDate, message: z.string().trim().max(1000).default('') });
export const visitStatusInput = z.object({ status: visitStatus });

// ---------- food ----------

export const foodPartner = z.object({ id: z.string(), name: z.string(), cuisine: z.string(), logoUrl: z.string().nullable(), active: z.boolean() });
export const foodPartnerInput = z.object({
  name: z.string().trim().min(2).max(80),
  cuisine: z.string().trim().min(2).max(80),
  logoUrl: z.string().nullable().optional(),
  active: z.boolean().default(true),
});

export const menuItem = z.object({
  id: z.string(),
  date: isoDate,
  meal,
  vegDish: z.string(),
  nonVegDish: z.string().nullable(),
  foodPartner: foodPartner.pick({ id: true, name: true, logoUrl: true }).nullable(),
});
export const menuWeek = z.object({ id: z.string(), hostelId: z.string(), weekStart: isoDate, theme: z.string(), items: z.array(menuItem) });
export const menuWeekInput = z.object({
  theme: z.string().trim().max(80).default(''),
  items: z
    .array(
      z.object({
        date: isoDate,
        meal,
        vegDish: z.string().trim().min(1).max(200),
        nonVegDish: z.string().trim().max(200).nullable().optional(),
        foodPartnerId: z.string().nullable().optional(),
      }),
    )
    .max(21),
});

export const headcount = z.object({
  date: isoDate,
  meals: z.array(z.object({ meal, total: z.number().int(), veg: z.number().int(), nonVeg: z.number().int(), skipped: z.number().int() })),
});

// ---------- subscriptions & billing ----------

export const subscription = z.object({
  id: z.string(),
  userId: z.string(),
  hostelId: z.string(),
  roomTypeId: z.string(),
  mealPlan,
  diet,
  status: subscriptionStatus,
  startDate: isoDate,
  cancelAt: isoDate.nullable(),
  createdAt: timestamp,
});

export const invoice = z.object({
  id: z.string(),
  subscriptionId: z.string(),
  userId: z.string(),
  hostelId: z.string(),
  periodStart: isoDate,
  periodEnd: isoDate,
  rentAmount: rupees,
  foodAmount: rupees,
  creditAmount: rupees,
  totalAmount: rupees,
  status: invoiceStatus,
  dueDate: isoDate,
  overdue: z.boolean(),
  razorpayOrderId: z.string().nullable(),
  paidAt: timestamp.nullable(),
});

export const moveRequest = z.object({
  id: z.string(),
  subscriptionId: z.string(),
  fromHostelId: z.string(),
  fromRoomTypeId: z.string(),
  toHostelId: z.string(),
  toRoomTypeId: z.string(),
  moveDate: isoDate,
  status: moveStatus,
  createdAt: timestamp,
});

export const mealSkip = z.object({ id: z.string(), date: isoDate, meal, creditAmount: rupees });

export const myStay = z.object({
  subscription: subscription.nullable(),
  hostel: hostelSummary.nullable(),
  roomType: roomType.nullable(),
  upcomingMove: moveRequest.nullable(),
  currentInvoice: invoice.nullable(),
});

export const subscribeInput = z.object({ hostelId: z.string(), roomTypeId: z.string(), mealPlan, diet, startDate: isoDate.optional() });
export const subscribeResult = z.object({ subscription, invoice });

export const checkout = z.object({
  invoice,
  /** `stub` when Razorpay keys are missing: show the "Simulate successful payment" button. */
  mode: z.enum(['live', 'stub']),
  razorpayKeyId: z.string(),
  razorpayOrderId: z.string(),
  amountPaise: z.number().int(),
  payer: z.object({ name: z.string(), phone: z.string(), email: z.string().nullable() }),
  description: z.string(),
});
export const paymentVerifyInput = z.object({ razorpayOrderId: z.string(), razorpayPaymentId: z.string(), razorpaySignature: z.string() });

export const weekMenuForTenant = z.object({
  days: z.array(
    z.object({
      date: isoDate,
      meals: z.array(
        z.object({
          meal,
          inPlan: z.boolean(),
          item: menuItem.nullable(),
          skipped: z.boolean(),
          canToggle: z.boolean(),
          cutoffAt: timestamp,
        }),
      ),
    }),
  ),
});
export const skipInput = z.object({ date: isoDate, meal });

export const moveInput = z.object({ toHostelId: z.string(), toRoomTypeId: z.string(), moveDate: isoDate });

export const payout = z.object({
  id: z.string(),
  ownerId: z.string(),
  hostelId: z.string(),
  periodMonth: z.string(),
  grossAmount: rupees,
  platformFee: rupees,
  netAmount: rupees,
  status: payoutStatus,
  paidAt: timestamp.nullable(),
});
export const generatePayoutsInput = z.object({ periodMonth: z.string().regex(/^\d{4}-\d{2}$/) });

// ---------- owner software plan (what we charge owners) ----------

export const saasInvoice = z.object({
  id: z.string(),
  hostelId: z.string(),
  ownerId: z.string(),
  plan: ownerPlan,
  periodMonth: z.string(),
  amount: rupees,
  status: saasInvoiceStatus,
  dueDate: isoDate,
  razorpayOrderId: z.string().nullable(),
  paidAt: timestamp.nullable(),
});
export const changePlanInput = z.object({ plan: ownerPlan });

export const ownerDashboard = z.object({
  hostels: z.array(
    z.object({
      hostel: hostelSummary.extend({ status: hostelStatus }),
      openIssues: z.number().int(),
      newVisits: z.number().int(),
      activeResidents: z.number().int(),
      occupancyPct: z.number(),
      views30d: z.number().int(),
      rating: z.number().nullable(),
    }),
  ),
  dueSaasInvoices: z.array(saasInvoice),
});

// ---------- residents, reviews, issues, community ----------

export const residency = z.object({
  id: z.string(),
  userId: z.string(),
  hostelId: z.string(),
  roomLabel: z.string().nullable(),
  source: residencySource,
  status: residencyStatus,
  startDate: isoDate,
  endDate: isoDate.nullable(),
  /** Rent the owner tracks for offline residents (Pro rent ledger). */
  monthlyRent: rupees.nullable(),
  createdAt: timestamp,
});
export const residencyWithPeople = residency.extend({
  user: z.object({ id: z.string(), name: z.string(), phone: z.string() }),
  hostel: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
});
export const claimResidencyInput = z.object({ hostelId: z.string(), startDate: isoDate, roomLabel: z.string().trim().max(40).optional() });
export const ownerAddResidentInput = z.object({
  phone,
  name: z.string().trim().min(1).max(80),
  startDate: isoDate,
  roomLabel: z.string().trim().max(40).optional(),
  monthlyRent: rupees.optional(),
});
export const residencyDecisionInput = z.object({ status: z.enum(['active', 'rejected', 'ended']), endDate: isoDate.optional() });

export const rentPayment = z.object({
  id: z.string(),
  residencyId: z.string(),
  periodMonth: z.string(),
  amount: rupees,
  paidOn: isoDate,
  note: z.string(),
});
export const rentPaymentInput = z.object({
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/),
  amount: rupees,
  paidOn: isoDate,
  note: z.string().trim().max(200).default(''),
});

const stars = z.number().int().min(1).max(5);
export const review = z.object({
  id: z.string(),
  hostelId: z.string(),
  author: publicUser,
  verifiedResident: z.boolean(),
  stayedFrom: isoDate.nullable(),
  stayedTo: isoDate.nullable(),
  overall: stars,
  food: stars.nullable(),
  cleanliness: stars,
  safety: stars,
  value: stars,
  staff: stars,
  title: z.string(),
  body: z.string(),
  ownerReply: z.string().nullable(),
  ownerRepliedAt: timestamp.nullable(),
  status: reviewStatus,
  createdAt: timestamp,
});
export const reviewInput = z.object({
  overall: stars,
  food: stars.nullable().optional(),
  cleanliness: stars,
  safety: stars,
  value: stars,
  staff: stars,
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(20).max(4000),
});
export const reviewReplyInput = z.object({ reply: z.string().trim().min(1).max(2000) });
export const reviewModerationInput = z.object({ status: reviewStatus });

export const issueComment = z.object({
  id: z.string(),
  issueId: z.string(),
  author: publicUser.extend({ role }),
  isOwner: z.boolean(),
  body: z.string(),
  createdAt: timestamp,
});
export const issue = z.object({
  id: z.string(),
  hostelId: z.string(),
  /** null when the issue is anonymous and the viewer is not the reporter or admin. */
  reporter: publicUser.nullable(),
  anonymous: z.boolean(),
  /** Public issues show (without reporter) on the hostel's transparency board. */
  isPublic: z.boolean(),
  category: issueCategory,
  severity: issueSeverity,
  title: z.string(),
  description: z.string(),
  photoUrls: z.array(z.string()),
  status: issueStatus,
  upvotes: z.number().int(),
  upvotedByMe: z.boolean(),
  acknowledgedAt: timestamp.nullable(),
  resolvedAt: timestamp.nullable(),
  closedAt: timestamp.nullable(),
  createdAt: timestamp,
});
export const issueDetail = issue.extend({ comments: z.array(issueComment) });
export const issueInput = z.object({
  category: issueCategory,
  severity: issueSeverity.default('medium'),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(4000),
  photoUrls: z.array(z.string()).max(6).default([]),
  anonymous: z.boolean().default(false),
  isPublic: z.boolean().default(true),
});
/** Owners move open→acknowledged→in_progress→resolved; residents move resolved→closed or resolved→open (reopen). */
export const issueStatusInput = z.object({ status: issueStatus, note: z.string().trim().max(2000).optional() });
export const issueCommentInput = z.object({ body: z.string().trim().min(1).max(2000) });
export const issueListQuery = z.object({ status: issueStatus.optional(), category: issueCategory.optional(), page: z.coerce.number().int().min(1).optional() });

export const postComment = z.object({ id: z.string(), postId: z.string(), author: publicUser, body: z.string(), createdAt: timestamp });
export const post = z.object({
  id: z.string(),
  hostelId: z.string(),
  author: publicUser.extend({ role }),
  kind: postKind,
  body: z.string(),
  pinned: z.boolean(),
  likes: z.number().int(),
  likedByMe: z.boolean(),
  commentCount: z.number().int(),
  createdAt: timestamp,
});
export const postDetail = post.extend({ comments: z.array(postComment) });
export const postInput = z.object({ body: z.string().trim().min(1).max(4000) });
export const postCommentInput = z.object({ body: z.string().trim().min(1).max(2000) });

export const myCommunity = z.object({
  residencies: z.array(residency.extend({ hostel: hostelSummary })),
});

// ---------- admin ----------

export const adminRejectInput = z.object({ reason: z.string().trim().min(3).max(500) });
export const adminVerifyPartnerInput = z.object({ platformFeePct: z.number().int().min(0).max(50).default(10) });
export const adminOverview = z.object({
  pendingListings: z.number().int(),
  partnerApplications: z.number().int(),
  liveHostels: z.number().int(),
  verifiedPartners: z.number().int(),
  proHostels: z.number().int(),
  activeSubscriptions: z.number().int(),
  overdueInvoices: z.number().int(),
  openIssues: z.number().int(),
  scheduledMoves: z.number().int(),
  mrr: z.object({ subscriptions: rupees, saas: rupees }),
});
export const adminSubscriptionRow = subscription.extend({
  user: z.object({ id: z.string(), name: z.string(), phone: z.string() }),
  hostel: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  overdueInvoices: z.number().int(),
});

export const health = z.object({
  ok: z.literal(true),
  service: z.literal('hostels-api'),
  version: z.string(),
  razorpay: z.enum(['live', 'stub']),
  msg91: z.enum(['live', 'stub']),
  storage: z.enum(['local', 'r2']),
});
