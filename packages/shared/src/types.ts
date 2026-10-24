import type { Diet, Meal, MealPlan } from './pricing';
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

export const MOVE_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
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
  createdAt: string;
};

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
  razorpay: 'live' | 'stub';
  msg91: 'live' | 'stub';
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
  'not_verified',
  'cutoff_passed',
  'meal_not_in_plan',
  'otp_invalid',
  'otp_rate_limited',
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
  hostel: { id: string; name: string; slug: string; area: string };
  canReview: boolean;
  hasReview: boolean;
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
  upvotes: number;
  upvotedByMe: boolean;
  needsResponse: boolean;
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
  scheduledMove: MoveRequest | null;
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
    credit: number;
  }[];
};

export type MyMenu = { mealPlan: MealPlan; diet: Diet; planLabel: string; days: MenuDay[] };

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
  amount: number;
  status: InvoiceStatus;
  dueDate: ISODate;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
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
  thisMonth: { month: string; hostels: { hostelId: string; hostelName: string; grossAmount: number; platformFee: number; netAmount: number }[] };
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
  escalatedIssues: number;
  /** Monthly recurring revenue in rupees, from what is in force today. */
  revenue: {
    /** Rent + food of active subscriptions (the gross we bill tenants each month). */
    subscriptionGross: number;
    /** Our platform fee on that gross, at each hostel's fee %. */
    platformFees: number;
    /** Owner software plans that are paying (not in trial, not suspended). */
    ownerPlans: number;
    /** Pro and Partner hostels still in their free trial. */
    trialHostels: number;
  };
};

/** Issues that need an admin nudge: unacknowledged for 48 hours, or unresolved for 7 days. */
export type EscalatedIssue = IssueView & { hostelName: string; hostelSlug: string; ageHours: number; reason: 'unacknowledged' | 'unresolved' };

/** Per-hostel numbers for the owner. View counts need the Pro or Partner plan; `locked` is true on Free. */
export type OwnerInsights = {
  hostelId: string;
  locked: boolean;
  views30d: number | null;
  viewsByDay: { day: ISODate; count: number }[] | null;
  visitRequests30d: number;
  occupancyPct: number;
  activeResidents: number;
  openIssues: number;
  rating: number | null;
  reviewCount: number;
};
