import type { Diet, Meal, MealPlan } from './pricing';
import type { PartnerCheck } from './seeker';
import type { ISODate } from './time';

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

export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'cancelled', 'ended', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = ['due', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * How a bill was settled; null while it is due, or when it was voided by the system (a plan change, a cancelled stay).
 * - `razorpay_live`: Razorpay with live keys (`rzp_live_`). The only real money.
 * - `razorpay_test`: Razorpay with test keys (`rzp_test_`). Moves no money.
 * - `simulated`: the "Simulate payment" button, or a stub-signed checkout, on a dev or demo instance.
 * - `waived`: an admin waived an owner bill. The bill is void; nothing was paid.
 */
export const PAYMENT_MODES = ['razorpay_live', 'razorpay_test', 'simulated', 'waived'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
/** The modes that are real money. Payouts, revenue and owner insights count only these. */
export const REAL_MONEY_MODES = ['razorpay_live'] as const satisfies readonly PaymentMode[];
/** Bills paid in a period that money figures leave out because no real money moved, in rupees. */
export type NotCounted = { simulated: number; test: number };

/**
 * Why a payment could not be applied to its bill, so it has to be refunded. Recorded instead of losing the money when
 * a payment lands after its bill stopped being payable (the bed hold expired, the plan changed, an admin waived it).
 */
export const PAYMENT_EXCEPTION_REASONS = [
  'bed_taken',
  'has_other_plan',
  'hostel_unavailable',
  'bill_cancelled',
  'bill_waived',
  'duplicate_payment',
  /** A paid bill for a move that was then cancelled: the rent paid above the room the payer stayed in is owed back. */
  'move_cancelled',
] as const;
export type PaymentExceptionReason = (typeof PAYMENT_EXCEPTION_REASONS)[number];
export const PAYMENT_EXCEPTION_STATUSES = ['refund_due', 'refunded'] as const;
export type PaymentExceptionStatus = (typeof PAYMENT_EXCEPTION_STATUSES)[number];

export const MOVE_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
/** A food plan or diet change waits for the next unpaid bill, then is applied by the daily job. */
export const FOOD_CHANGE_STATUSES = ['scheduled', 'applied', 'cancelled'] as const;
export type FoodChangeStatus = (typeof FOOD_CHANGE_STATUSES)[number];
export type MoveStatus = (typeof MOVE_STATUSES)[number];

export const PAYOUT_STATUSES = ['pending', 'paid'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const RESIDENCY_SOURCES = ['subscription', 'owner'] as const;
export type ResidencySource = (typeof RESIDENCY_SOURCES)[number];

export const RESIDENCY_STATUSES = ['invited', 'active', 'ended', 'declined'] as const;
export type ResidencyStatus = (typeof RESIDENCY_STATUSES)[number];

export const ISSUE_CATEGORIES = [
  'maintenance',
  'cleanliness',
  'food',
  'safety',
  'wifi',
  'water',
  'electricity',
  'other',
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const POST_KINDS = ['general', 'food', 'event', 'lost_found', 'buy_sell', 'announcement'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const OWNER_PLAN_TIERS = ['free', 'pro', 'partner'] as const;
export type OwnerPlanTier = (typeof OWNER_PLAN_TIERS)[number];

export const RENT_METHODS = ['cash', 'upi', 'bank', 'other'] as const;
export type RentMethod = (typeof RENT_METHODS)[number];

export const AREAS = [
  'Gachibowli',
  'Madhapur',
  'Kondapur',
  'HiTech City',
  'Financial District',
  'Ameerpet',
] as const;

export type User = {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  role: Role;
  createdAt: string;
  /** True once an OTP to this phone was verified. Invites and admin-by-phone need it. */
  phoneVerified: boolean;
  hasPassword: boolean;
  isDemo: boolean;
};

/** Which sign-in methods this server offers. `otp: 'stub'` means development, where the code is fixed. */
export type AuthMethods = {
  mode: 'standard' | 'demo';
  otp: 'live' | 'stub' | 'off';
  password: boolean;
  signup: boolean;
  demo: { enabled: boolean; accounts: { phone: string; name: string; role: Role }[] };
};

export type RoomType = {
  id: string;
  hostelId: string;
  sharing: SharingType;
  monthlyRent: number;
  advanceAmount: number;
  totalBeds: number;
  bedsAvailable: number;
  /** ISO time the bed counts last changed (owner edit, or a subscription taking or freeing a bed); null if not recorded yet. */
  bedsUpdatedAt: string | null;
};

export type HostelPhoto = { id: string; hostelId: string; url: string; sortOrder: number };

export type HostelSummary = {
  id: string;
  slug: string;
  name: string;
  city: string;
  area: string;
  lat: number;
  lng: number;
  genderType: GenderType;
  foodAvailable: boolean;
  isVerified: boolean;
  coverPhotoUrl: string | null;
  minRent: number | null;
  bedsAvailable: number;
  sharingTypes: SharingType[];
  rating: number | null;
  reviewCount: number;
  /** Kilometres from the search point, when searching near a location. */
  distanceKm?: number;
};

export type SearchResult = { items: HostelSummary[]; total: number; page: number; limit: number };

export type TransparencyStats = {
  windowDays: number;
  reported: number;
  resolvedPct: number;
  medianHoursToFirstResponse: number | null;
  medianHoursToResolve: number | null;
};

export type RatingBreakdown = {
  rating: number | null;
  reviewCount: number;
  cleanliness: number | null;
  food: number | null;
  safety: number | null;
  responsiveness: number | null;
};

export type Hostel = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  city: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  genderType: GenderType;
  amenities: string[];
  rules: string[];
  contactPhone: string;
  whatsappPhone: string | null;
  foodAvailable: boolean;
  status: HostelStatus;
  partnerStatus: PartnerStatus;
  platformFeePct: number;
  rejectionReason: string | null;
  createdAt: string;
};

export type HostelDetail = Hostel & {
  isVerified: boolean;
  photos: HostelPhoto[];
  roomTypes: RoomType[];
  ratings: RatingBreakdown;
  /** Null until the hostel has enough issues in the window to be meaningful. */
  transparency: TransparencyStats | null;
  /** For verified partners: what the in-person check covered. Null for everyone else. */
  partnerCheck?: PartnerCheck | null;
};

export type VisitRequest = {
  id: string;
  hostelId: string;
  userId: string;
  preferredDate: ISODate;
  message: string;
  status: VisitStatus;
  createdAt: string;
};

export type FoodPartner = {
  id: string;
  name: string;
  cuisine: string;
  logoUrl: string | null;
  active: boolean;
};

export type MenuItem = {
  id: string;
  menuWeekId: string;
  date: ISODate;
  meal: Meal;
  vegDish: string;
  nonVegDish: string | null;
  foodPartnerId: string | null;
};

export type MenuWeek = {
  id: string;
  hostelId: string;
  weekStart: ISODate;
  theme: string;
  items: MenuItem[];
};

export type Subscription = {
  id: string;
  userId: string;
  hostelId: string;
  roomTypeId: string;
  mealPlan: MealPlan;
  diet: Diet;
  status: SubscriptionStatus;
  startDate: ISODate;
  cancelAt: ISODate | null;
  createdAt: string;
};

export type Invoice = {
  id: string;
  subscriptionId: string;
  userId: string;
  hostelId: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  rentAmount: number;
  foodAmount: number;
  creditAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  dueDate: ISODate;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  paymentMode: PaymentMode | null;
  /** Derived on read. */
  isOverdue: boolean;
};

export type MealSkip = {
  id: string;
  subscriptionId: string;
  date: ISODate;
  meal: Meal;
  creditAmount: number;
  createdAt: string;
};

export type MoveRequest = {
  id: string;
  subscriptionId: string;
  fromHostelId: string;
  fromRoomTypeId: string;
  toHostelId: string;
  toRoomTypeId: string;
  moveDate: ISODate;
  status: MoveStatus;
  /** Set when the move was cancelled for the tenant (the destination stopped taking residents), in plain words. */
  cancelReason: string | null;
  createdAt: string;
};

/** A move as the tenant sees it: where to, and whether that hostel is taking residents right now. */
export type MoveView = MoveRequest & { toHostelName: string; toSharing: SharingType | null; toHostelOpen: boolean };

export type Payout = {
  id: string;
  ownerId: string;
  hostelId: string;
  periodMonth: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  status: PayoutStatus;
  paidAt: string | null;
};

export type AuthSession = { user: User; token: string; expiresAt: string };

export type OtpSent = { ok: true; expiresInSeconds: number; devOtp?: string };

export type Health = {
  ok: true;
  service: 'hostels-api';
  version: string;
  db: 'up' | 'down';
  /** `live` means Razorpay keys are configured (test or live keys); `payments` says which. */
  razorpay: 'live' | 'stub';
  /** How payments taken now are recorded. Only `razorpay_live` is real money. */
  payments: Exclude<PaymentMode, 'waived'>;
  /** How OTP login works: real texts, the fixed development code, or off (phone + password only). */
  msg91: 'live' | 'stub' | 'off';
  devMode: boolean;
};

export const ERROR_CODES = [
  'validation',
  'unauthorized',
  'forbidden',
  'not_found',
  'internal',
  'no_beds_available',
  'already_subscribed',
  'cannot_subscribe_own_hostel',
  'not_verified',
  'cutoff_passed',
  'meal_not_in_plan',
  'otp_invalid',
  'otp_rate_limited',
  'rate_limited',
  'invoice_already_paid',
  'signature_invalid',
  'move_not_allowed',
  'invalid_state',
  'not_a_resident',
  'review_not_allowed',
  'plan_required',
  'invalid_credentials',
  'login_locked',
  'signup_failed',
  'method_disabled',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorBody = {
  error: ErrorCode;
  message: string;
  issues?: { path: string; message: string }[];
};

// ---------------------------------------------------------------------------
// Response shapes beyond the core records.

export type Review = {
  id: string;
  hostelId: string;
  rating: number;
  cleanliness: number;
  food: number | null;
  safety: number;
  responsiveness: number;
  body: string;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
  /** Set when the owner changed their reply after posting it; the card says "edited" with this date. */
  ownerReplyEditedAt: string | null;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  author: string;
  verifiedVia: ResidencySource | null;
  stay: { from: ISODate; to: ISODate | null } | null;
};

export type Residency = {
  id: string;
  userId: string | null;
  phone: string;
  name: string;
  hostelId: string;
  roomTypeId: string | null;
  source: ResidencySource;
  subscriptionId: string | null;
  monthlyRent: number | null;
  startDate: ISODate;
  endDate: ISODate | null;
  status: ResidencyStatus;
  directoryOptIn: boolean;
  createdAt: string;
};

export type MyResidency = Residency & {
  hostel: { id: string; name: string; slug: string; area: string; foodAvailable: boolean };
  canReview: boolean;
  /** Why this stay cannot be reviewed yet (or any more), when `canReview` is false. */
  reviewBlockedReason: string | null;
  hasReview: boolean;
  /** The resident's own review of this hostel, if they wrote one. */
  review: (Review & { hiddenReason: string | null }) | null;
};

export type IssueView = {
  id: string;
  hostelId: string;
  category: IssueCategory;
  title: string;
  description: string;
  photoUrl: string | null;
  status: IssueStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  reporter: { id: string; name: string } | null;
  mine: boolean;
  /** The reporter moved out: they can still read their issue, but not comment, me-too, confirm or reopen. */
  readOnly: boolean;
  upvotes: number;
  upvotedByMe: boolean;
  /** Open, unanswered by the hostel since it was reported or last reopened, for over a day (`issueNeedsResponse`). */
  needsResponse: boolean;
  /** When the hostel's answer has been awaited since (the report or the latest reopen); null once answered. */
  awaitingReplySince: string | null;
};

export type IssueDetail = IssueView & {
  updates: {
    id: string;
    message: string;
    fromStatus: IssueStatus | null;
    toStatus: IssueStatus | null;
    createdAt: string;
    author: string;
    byOwner: boolean;
    /** Written by the platform itself (the issue closed on its own), not by a person. */
    bySystem: boolean;
  }[];
};

export type CommunityPost = {
  id: string;
  kind: PostKind;
  body: string;
  photoUrl: string | null;
  pinned: boolean;
  hidden: boolean;
  createdAt: string;
  author: string;
  mine: boolean;
  likes: number;
  likedByMe: boolean;
  comments: { id: string; body: string; hidden: boolean; createdAt: string; author: string; mine: boolean }[];
};

export type MySubscription = {
  subscription: Subscription;
  hostel: { id: string; slug: string; name: string; area: string };
  roomType: RoomType;
  currentPeriod: { index: number; start: ISODate; end: ISODate };
  invoices: Invoice[];
  scheduledMove: MoveView | null;
  /** A move we cancelled for the tenant in the last 30 days, with the reason, so they know why they're staying. */
  cancelledMove: MoveView | null;
  /** A food plan or diet change waiting for its first bill. */
  scheduledFoodChange: FoodPlanChange | null;
};

export type FoodPlanChange = {
  id: string;
  subscriptionId: string;
  mealPlan: MealPlan;
  diet: Diet;
  /** First day of the billing period the change starts with: the first period whose bill is not paid yet. */
  effectiveFrom: ISODate;
  status: FoodChangeStatus;
  createdAt: string;
};

export type MenuDay = {
  date: ISODate;
  hostelId: string;
  theme: string | null;
  meals: {
    meal: Meal;
    inPlan: boolean;
    vegDish: string | null;
    nonVegDish: string | null;
    foodPartner: string | null;
    skipped: boolean;
    cutoff: string;
    canChange: boolean;
    /** What skipping this meal takes off a bill; 0 when no bill will carry it (the plan ends first). */
    credit: number;
  }[];
};

export type MyMenu = {
  mealPlan: MealPlan;
  diet: Diet;
  planLabel: string;
  /** Skips dated from here on earn nothing: the plan ends before the bill that would carry them. Null if none. */
  noCreditFrom: ISODate | null;
  days: MenuDay[];
};

export type Headcount = {
  date: ISODate;
  meals: { meal: Meal; total: number; veg: number; nonVeg: number; skipped: number }[];
};

export type OwnerInvoice = {
  id: string;
  ownerPlanId: string;
  hostelId: string;
  ownerId: string;
  plan: OwnerPlanTier;
  periodStart: ISODate;
  periodEnd: ISODate;
  /** What is payable: the plan price less `creditAmount` (or the used share of a month cut short by an upgrade). */
  amount: number;
  /** Unused days already paid on the previous plan, taken off this bill. */
  creditAmount: number;
  /** What the credit or a shortened period is for, in words. */
  note: string | null;
  status: InvoiceStatus;
  dueDate: ISODate;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  paymentMode: PaymentMode | null;
  createdAt: string;
  isOverdue: boolean;
};

export type OwnerPlanInfo = {
  plan: {
    id: string;
    hostelId: string;
    plan: OwnerPlanTier;
    pendingPlan: OwnerPlanTier | null;
    pendingPlanOn: ISODate | null;
    startDate: ISODate;
    trialEndsOn: ISODate | null;
    suspended: boolean;
  } | null;
  price: number;
  inTrial: boolean;
  partnerStatus: PartnerStatus;
  bills: OwnerInvoice[];
};

export type PlanState = { plan: OwnerPlanTier; suspended: boolean; effective: OwnerPlanTier };
export type OwnerHostelDetail = HostelDetail & { plan: PlanState };

export type PaymentPage = {
  invoiceId: string;
  kind: 'tenant' | 'owner';
  amount: number;
  status: InvoiceStatus;
  description: string;
  invoice: Invoice | OwnerInvoice;
  keyId: string;
  stub: boolean;
  /** A payment for this bill that arrived when it could no longer be applied, and is (or was) refunded. */
  refund: PaymentException | null;
};

/** A payment we received but could not apply to its bill: a refund is owed until an admin marks it refunded. */
export type PaymentException = {
  id: string;
  billKind: 'tenant' | 'owner';
  billId: string;
  /** The person who paid: the tenant, or the owner for a plan bill. */
  userId: string;
  amount: number;
  paymentMode: Exclude<PaymentMode, 'waived'>;
  reason: PaymentExceptionReason;
  status: PaymentExceptionStatus;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  createdAt: string;
  refundedAt: string | null;
  refundNote: string | null;
};

export type AdminPaymentException = PaymentException & {
  hostelName: string;
  payer: { id: string; name: string; phone: string };
};

export type CheckoutOrder = { invoiceId: string; orderId: string; amount: number; currency: 'INR'; keyId: string; stub: boolean };

export type RentSheet = {
  month: string;
  rows: {
    residencyId: string;
    name: string;
    phone: string;
    amountDue: number;
    amountPaid: number;
    paidOn: ISODate | null;
    method: RentMethod | null;
    note: string;
    status: 'paid' | 'partial' | 'unpaid';
  }[];
  totals: { due: number; collected: number; unpaid: number };
};

export type OwnerVisit = VisitRequest & { hostelName: string; visitor: { name: string; phone: string } };
export type MyVisit = VisitRequest & { hostel: { name: string; slug: string } };
export type Subscriber = {
  subscription: Subscription;
  user: { id: string; name: string; phone: string };
  sharing: SharingType;
};
export type PayoutView = Payout & { hostelName: string };
export type OwnerPayouts = {
  history: PayoutView[];
  thisMonth: {
    month: string;
    /** Real money only (Razorpay live). */
    hostels: { hostelId: string; hostelName: string; grossAmount: number; platformFee: number; netAmount: number }[];
    /** Subscriber bills paid this month without real money, which payouts leave out. */
    notCounted: NotCounted;
  };
};

/** What the platform took in for a month: real money only, with what was left out shown separately. */
export type PlatformRevenue = {
  /** The IST month covered, `YYYY-MM`. */
  month: string;
  /** Tenant bills (rent + food − credits) paid with real money in the month. */
  subscriptionGross: number;
  /** Our fee on those bills, at each hostel's fee %. */
  platformFees: number;
  /** Owner plan bills paid with real money in the month. */
  ownerPlans: number;
  /** Bills paid in the month without real money (simulated, or Razorpay test mode). Never in the figures above. */
  notCounted: { tenant: NotCounted; owner: NotCounted };
};
export type Area = { area: string; count: number; slug: string };
export type AdminStats = {
  listingsPending: number;
  partnersApplied: number;
  liveHostels: number;
  activeSubscriptions: number;
  flaggedReviews: number;
  openReports: number;
  overdueBills: number;
  overdueOwnerBills: number;
  suspendedHostels: number;
  escalatedIssues: number;
  /** Material edits of live listings in the last 7 days. */
  listingChanges7d: number;
  /** Verified partners that moved address or pin and need checking again. */
  partnerRechecks: number;
  /** Payments received that could not be applied and still have to be refunded. */
  refundsDue: number;
  /** This month so far, in rupees, counting real money only. */
  revenue: PlatformRevenue & {
    /** Pro and Partner hostels still in their free trial. */
    trialHostels: number;
  };
};

/** Issues that need an admin nudge: unacknowledged for 48 hours, or unresolved for 7 days. */
export type EscalatedIssue = IssueView & { hostelName: string; hostelSlug: string; ageHours: number; reason: 'unacknowledged' | 'unresolved' };

/**
 * Per-hostel numbers for the owner. The summary and issue health are free. View counts, room occupancy and the
 * month's money need Pro or Partner: `locked` is true (and those fields null) on Free or a paused plan.
 */
export type OwnerInsights = {
  hostelId: string;
  /** The month the money figures cover, `YYYY-MM`. */
  month: string;
  plan: PlanState;
  locked: boolean;
  views30d: number | null;
  viewsByDay: { day: ISODate; count: number }[] | null;
  visitRequests30d: number;
  occupancyPct: number;
  activeResidents: number;
  openIssues: number;
  rating: number | null;
  reviewCount: number;
  occupancy: {
    totalBeds: number;
    freeBeds: number;
    occupiedBeds: number;
    occupancyPct: number | null;
    activeResidents: number;
    activeSubscribers: number;
    rooms: { roomTypeId: string; sharing: SharingType; totalBeds: number; bedsAvailable: number; monthlyRent: number }[];
  } | null;
  /**
   * Subscription money is what tenants paid online this month with real money (what payouts are made from); rent is the
   * owner's own ledger.
   */
  revenue: {
    subscriptionGross: number;
    platformFeePct: number;
    platformFee: number;
    subscriptionNet: number;
    /** Subscription bills paid this month without real money (simulated or Razorpay test mode), left out above. */
    notCounted: NotCounted;
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
  /** What the owner owes us for this hostel's plan, shown on every plan (a paused hostel most of all). */
  planBill: {
    /** Unpaid plan bills, in rupees. */
    due: number;
    /** The oldest unpaid bill, which decides overdue and the pause. */
    oldest: { id: string; amount: number; dueDate: ISODate; isOverdue: boolean; pausesOn: ISODate } | null;
    suspended: boolean;
  };
};

/** Owner Issues tab badges: issues waiting over a day for the hostel's first answer, in total and per hostel. */
export type OwnerIssueSummary = { needsResponse: number; byHostel: Record<string, number> };
