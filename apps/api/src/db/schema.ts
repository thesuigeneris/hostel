import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  DIETS,
  GENDER_TYPES,
  HOSTEL_STATUSES,
  INVOICE_STATUSES,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  MEAL_PLANS,
  MEALS,
  MOVE_STATUSES,
  FOOD_CHANGE_STATUSES,
  OWNER_PLAN_TIERS,
  PARTNER_STATUSES,
  PAYMENT_EXCEPTION_REASONS,
  PAYMENT_EXCEPTION_STATUSES,
  PAYMENT_MODES,
  PAYOUT_STATUSES,
  POST_KINDS,
  RENT_METHODS,
  RESIDENCY_SOURCES,
  RESIDENCY_STATUSES,
  ROLES,
  SHARING_TYPES,
  SUBSCRIPTION_STATUSES,
  VISIT_STATUSES,
} from '@hostels/shared';

export const roleEnum = pgEnum('role', ROLES);
export const sharingEnum = pgEnum('sharing', SHARING_TYPES);
export const genderTypeEnum = pgEnum('gender_type', GENDER_TYPES);
export const hostelStatusEnum = pgEnum('hostel_status', HOSTEL_STATUSES);
export const partnerStatusEnum = pgEnum('partner_status', PARTNER_STATUSES);
export const visitStatusEnum = pgEnum('visit_status', VISIT_STATUSES);
export const mealEnum = pgEnum('meal', MEALS);
export const mealPlanEnum = pgEnum('meal_plan', MEAL_PLANS);
export const dietEnum = pgEnum('diet', DIETS);
export const subscriptionStatusEnum = pgEnum('subscription_status', SUBSCRIPTION_STATUSES);
export const invoiceStatusEnum = pgEnum('invoice_status', INVOICE_STATUSES);
export const moveStatusEnum = pgEnum('move_status', MOVE_STATUSES);
export const foodChangeStatusEnum = pgEnum('food_change_status', FOOD_CHANGE_STATUSES);
export const payoutStatusEnum = pgEnum('payout_status', PAYOUT_STATUSES);
export const paymentModeEnum = pgEnum('payment_mode', PAYMENT_MODES);
export const paymentExceptionReasonEnum = pgEnum('payment_exception_reason', PAYMENT_EXCEPTION_REASONS);
export const paymentExceptionStatusEnum = pgEnum('payment_exception_status', PAYMENT_EXCEPTION_STATUSES);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const day = (name: string) => date(name, { mode: 'string' });

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull().default(''),
  email: text('email'),
  role: roleEnum('role').notNull().default('tenant'),
  createdAt: createdAt(),
  /** Seeded demo person. Never allowed to sign in on a production standard instance. */
  isDemo: boolean('is_demo').notNull().default(false),
  /** Set when an OTP to this phone was verified. Invites and ADMIN_PHONES apply only once set. */
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  /** argon2id (PHC string) from Bun.password; null for OTP-only accounts. */
  passwordHash: text('password_hash'),
  /**
   * Set when admin was granted on the server (`admin:grant`, demo seed). Such admins keep the role;
   * any other admin holds it only while their phone is in ADMIN_PHONES.
   */
  adminGrantedAt: timestamp('admin_granted_at', { withTimezone: true }),
});

/** Failed password logins per phone (known or not), so lockouts don't reveal which phones have accounts. */
export const loginThrottle = pgTable('login_throttle', {
  phone: text('phone').primaryKey(),
  failures: integer('failures').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
});

export const otpCodes = pgTable('otp_codes', {
  phone: text('phone').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  /** Rolling one-hour send limit. */
  sendWindowStart: timestamp('send_window_start', { withTimezone: true }).notNull(),
  sendCount: integer('send_count').notNull().default(1),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the bearer token; the raw token is only ever held by the client. */
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** One-time codes that let the app open a signed-in page on the website (paying a bill). */
export const loginHandoffs = pgTable('login_handoffs', {
  codeHash: text('code_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export const hostels = pgTable(
  'hostels',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    city: text('city').notNull().default('Hyderabad'),
    area: text('area').notNull(),
    address: text('address').notNull().default(''),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    genderType: genderTypeEnum('gender_type').notNull(),
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    rules: jsonb('rules').$type<string[]>().notNull().default([]),
    contactPhone: text('contact_phone').notNull(),
    whatsappPhone: text('whatsapp_phone'),
    foodAvailable: boolean('food_available').notNull().default(false),
    status: hostelStatusEnum('status').notNull().default('draft'),
    partnerStatus: partnerStatusEnum('partner_status').notNull().default('none'),
    platformFeePct: doublePrecision('platform_fee_pct').notNull().default(10),
    rejectionReason: text('rejection_reason'),
    /**
     * Set when a verified partner moves its address or map pin: the in-person check was made somewhere else. The
     * badge stays (editing keeps a listing live) and admins see the flag until someone checks the place again.
     */
    partnerRecheckSince: timestamp('partner_recheck_since', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('hostels_owner_idx').on(t.ownerId),
    index('hostels_status_area_idx').on(t.status, t.area),
    check('hostels_fee_pct_range', sql`${t.platformFeePct} >= 0 and ${t.platformFeePct} <= 100`),
  ],
);

export const hostelPhotos = pgTable(
  'hostel_photos',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('hostel_photos_hostel_idx').on(t.hostelId)],
);

export const roomTypes = pgTable(
  'room_types',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    sharing: sharingEnum('sharing').notNull(),
    monthlyRent: integer('monthly_rent').notNull(),
    advanceAmount: integer('advance_amount').notNull().default(0),
    totalBeds: integer('total_beds').notNull(),
    bedsAvailable: integer('beds_available').notNull(),
    /** When the bed counts last changed: an owner edit, or a bed taken or freed by a subscription. Null for rows from before this was recorded. */
    bedsUpdatedAt: timestamp('beds_updated_at', { withTimezone: true }),
  },
  (t) => [
    index('room_types_hostel_idx').on(t.hostelId),
    check('room_types_beds_range', sql`${t.bedsAvailable} >= 0 and ${t.bedsAvailable} <= ${t.totalBeds}`),
    check('room_types_amounts_nonneg', sql`${t.monthlyRent} >= 0 and ${t.advanceAmount} >= 0`),
  ],
);

export const visitRequests = pgTable(
  'visit_requests',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    preferredDate: day('preferred_date').notNull(),
    message: text('message').notNull().default(''),
    status: visitStatusEnum('status').notNull().default('new'),
    createdAt: createdAt(),
  },
  (t) => [
    index('visit_requests_hostel_idx').on(t.hostelId),
    // One waiting request per person per hostel, even when the form is sent twice at once.
    uniqueIndex('visit_requests_one_open').on(t.hostelId, t.userId).where(sql`${t.status} = 'new'`),
  ],
);

export const foodPartners = pgTable('food_partners', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cuisine: text('cuisine').notNull().default(''),
  logoUrl: text('logo_url'),
  active: boolean('active').notNull().default(true),
});

export const menuWeeks = pgTable(
  'menu_weeks',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    weekStart: day('week_start').notNull(),
    theme: text('theme').notNull().default(''),
  },
  (t) => [unique('menu_weeks_hostel_week').on(t.hostelId, t.weekStart)],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: text('id').primaryKey(),
    menuWeekId: text('menu_week_id')
      .notNull()
      .references(() => menuWeeks.id, { onDelete: 'cascade' }),
    date: day('date').notNull(),
    meal: mealEnum('meal').notNull(),
    vegDish: text('veg_dish').notNull(),
    nonVegDish: text('non_veg_dish'),
    foodPartnerId: text('food_partner_id').references(() => foodPartners.id),
  },
  (t) => [unique('menu_items_week_date_meal').on(t.menuWeekId, t.date, t.meal)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    mealPlan: mealPlanEnum('meal_plan').notNull(),
    diet: dietEnum('diet').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('pending'),
    startDate: day('start_date').notNull(),
    cancelAt: day('cancel_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('subscriptions_hostel_idx').on(t.hostelId),
    // A tenant has at most one open subscription.
    uniqueIndex('subscriptions_one_open_per_user')
      .on(t.userId)
      .where(sql`${t.status} in ('pending', 'active')`),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id),
    periodStart: day('period_start').notNull(),
    periodEnd: day('period_end').notNull(),
    rentAmount: integer('rent_amount').notNull(),
    foodAmount: integer('food_amount').notNull(),
    creditAmount: integer('credit_amount').notNull().default(0),
    totalAmount: integer('total_amount').notNull(),
    status: invoiceStatusEnum('status').notNull().default('due'),
    dueDate: day('due_date').notNull(),
    razorpayOrderId: text('razorpay_order_id').unique(),
    razorpayPaymentId: text('razorpay_payment_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** How the bill was paid; set exactly when it is paid. Money figures count only real money (`razorpay_live`). */
    paymentMode: paymentModeEnum('payment_mode'),
    createdAt: createdAt(),
  },
  (t) => [
    index('invoices_user_idx').on(t.userId),
    index('invoices_hostel_paid_idx').on(t.hostelId, t.paidAt),
    // Voided bills are regenerated for the same period, so uniqueness ignores them.
    uniqueIndex('invoices_subscription_period')
      .on(t.subscriptionId, t.periodStart)
      .where(sql`${t.status} <> 'void'`),
    // A paid bill always says how it was paid, and only a paid bill does (tenant bills are never waived).
    check(
      'invoices_payment_mode_status',
      sql`(${t.status} = 'paid' and ${t.paymentMode} is not null and ${t.paymentMode} <> 'waived') or (${t.status} <> 'paid' and ${t.paymentMode} is null)`,
    ),
  ],
);

export const mealSkips = pgTable(
  'meal_skips',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    date: day('date').notNull(),
    meal: mealEnum('meal').notNull(),
    creditAmount: integer('credit_amount').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('meal_skips_sub_date_meal').on(t.subscriptionId, t.date, t.meal)],
);

export const moveRequests = pgTable(
  'move_requests',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    fromHostelId: text('from_hostel_id')
      .notNull()
      .references(() => hostels.id),
    fromRoomTypeId: text('from_room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    toHostelId: text('to_hostel_id')
      .notNull()
      .references(() => hostels.id),
    toRoomTypeId: text('to_room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    moveDate: day('move_date').notNull(),
    status: moveStatusEnum('status').notNull().default('scheduled'),
    /** Why we cancelled the move for the tenant (the destination stopped taking residents); null otherwise. */
    cancelReason: text('cancel_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('move_requests_subscription_idx').on(t.subscriptionId),
    uniqueIndex('move_requests_one_scheduled')
      .on(t.subscriptionId)
      .where(sql`${t.status} = 'scheduled'`),
  ],
);

export const payouts = pgTable(
  'payouts',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id),
    periodMonth: text('period_month').notNull(),
    grossAmount: integer('gross_amount').notNull(),
    platformFee: integer('platform_fee').notNull(),
    netAmount: integer('net_amount').notNull(),
    status: payoutStatusEnum('status').notNull().default('pending'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique('payouts_hostel_month').on(t.hostelId, t.periodMonth)],
);

// ---------------------------------------------------------------------------
// Personas addendum: residencies, reviews, issues, community, owner plans.

/** A food plan or diet change from the next unpaid bill (product gap 1a). Applied to the subscription by the daily job. */
export const foodPlanChanges = pgTable(
  'food_plan_changes',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    mealPlan: mealPlanEnum('meal_plan').notNull(),
    diet: dietEnum('diet').notNull(),
    effectiveFrom: day('effective_from').notNull(),
    status: foodChangeStatusEnum('status').notNull().default('scheduled'),
    createdAt: createdAt(),
  },
  (t) => [
    index('food_plan_changes_subscription_idx').on(t.subscriptionId),
    uniqueIndex('food_plan_changes_one_scheduled')
      .on(t.subscriptionId)
      .where(sql`${t.status} = 'scheduled'`),
  ],
);

export const residencySourceEnum = pgEnum('residency_source', RESIDENCY_SOURCES);
export const residencyStatusEnum = pgEnum('residency_status', RESIDENCY_STATUSES);
export const issueCategoryEnum = pgEnum('issue_category', ISSUE_CATEGORIES);
export const issueStatusEnum = pgEnum('issue_status', ISSUE_STATUSES);
export const postKindEnum = pgEnum('post_kind', POST_KINDS);
export const ownerPlanTierEnum = pgEnum('owner_plan_tier', OWNER_PLAN_TIERS);
export const rentMethodEnum = pgEnum('rent_method', RENT_METHODS);
export const reportTargetEnum = pgEnum('report_target', ['post', 'comment']);

export const residencies = pgTable(
  'residencies',
  {
    id: text('id').primaryKey(),
    /** Null until an owner-invited phone signs in. */
    userId: text('user_id').references(() => users.id),
    phone: text('phone').notNull(),
    name: text('name').notNull().default(''),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    roomTypeId: text('room_type_id').references(() => roomTypes.id, { onDelete: 'set null' }),
    source: residencySourceEnum('source').notNull(),
    subscriptionId: text('subscription_id').references(() => subscriptions.id),
    monthlyRent: integer('monthly_rent'),
    startDate: day('start_date').notNull(),
    endDate: day('end_date'),
    status: residencyStatusEnum('status').notNull(),
    directoryOptIn: boolean('directory_opt_in').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('residencies_hostel_idx').on(t.hostelId, t.status),
    index('residencies_user_idx').on(t.userId),
    index('residencies_phone_idx').on(t.phone),
    // One open owner invite or stay per phone per hostel, so two "add resident" taps at once make one invite.
    // Stays from subscriptions are left out: activating a paid plan must never fail on this index.
    uniqueIndex('residencies_one_open_owner_stay')
      .on(t.hostelId, t.phone)
      .where(sql`${t.source} = 'owner' and ${t.status} in ('invited', 'active')`),
  ],
);

export const reviews = pgTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    residencyId: text('residency_id')
      .notNull()
      .references(() => residencies.id),
    rating: integer('rating').notNull(),
    cleanliness: integer('cleanliness').notNull(),
    food: integer('food'),
    safety: integer('safety').notNull(),
    responsiveness: integer('responsiveness').notNull(),
    body: text('body').notNull(),
    ownerReply: text('owner_reply'),
    ownerRepliedAt: timestamp('owner_replied_at', { withTimezone: true }),
    /** Set when the owner edits their reply; the public card then says "edited" with this date. */
    ownerReplyEditedAt: timestamp('owner_reply_edited_at', { withTimezone: true }),
    hidden: boolean('hidden').notNull().default(false),
    hiddenReason: text('hidden_reason'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('reviews_hostel_user').on(t.hostelId, t.userId),
    check(
      'reviews_ratings_range',
      sql`${t.rating} between 1 and 5 and ${t.cleanliness} between 1 and 5 and ${t.safety} between 1 and 5 and ${t.responsiveness} between 1 and 5 and (${t.food} is null or ${t.food} between 1 and 5)`,
    ),
  ],
);

export const reviewFlags = pgTable(
  'review_flags',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: createdAt(),
  },
  // One open flag per person per review. Once an admin acts on a review its flags are resolved, and the same person
  // may flag it again (for example after it is shown again).
  (t) => [uniqueIndex('review_flags_one_open').on(t.reviewId, t.userId).where(sql`not ${t.resolved}`)],
);

export const issues = pgTable(
  'issues',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => users.id),
    residencyId: text('residency_id')
      .notNull()
      .references(() => residencies.id),
    category: issueCategoryEnum('category').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    photoUrl: text('photo_url'),
    status: issueStatusEnum('status').notNull().default('open'),
    createdAt: createdAt(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('issues_hostel_idx').on(t.hostelId, t.createdAt)],
);

export const issueUpdates = pgTable(
  'issue_updates',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    /** Null when the platform made the change itself (an issue closing on its own), never a stand-in user. */
    authorId: text('author_id').references(() => users.id),
    message: text('message').notNull().default(''),
    fromStatus: issueStatusEnum('from_status'),
    toStatus: issueStatusEnum('to_status'),
    createdAt: createdAt(),
  },
  (t) => [index('issue_updates_issue_idx').on(t.issueId)],
);

/** When a person last opened an issue they reported: updates by anyone else after that are unread (product gap 1b). */
export const issueReads = pgTable(
  'issue_reads',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.userId] })],
);

export const issueUpvotes = pgTable(
  'issue_upvotes',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.userId] })],
);

export const communityPosts = pgTable(
  'community_posts',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    kind: postKindEnum('kind').notNull().default('general'),
    body: text('body').notNull(),
    photoUrl: text('photo_url'),
    pinned: boolean('pinned').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('community_posts_hostel_idx').on(t.hostelId, t.createdAt)],
);

export const communityComments = pgTable(
  'community_comments',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => communityPosts.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('community_comments_post_idx').on(t.postId)],
);

export const contentReports = pgTable(
  'content_reports',
  {
    id: text('id').primaryKey(),
    targetType: reportTargetEnum('target_type').notNull(),
    targetId: text('target_id').notNull(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: createdAt(),
  },
  // One open report per person per post or comment; resolved reports don't stop a fresh one.
  (t) => [uniqueIndex('content_reports_one_open').on(t.targetType, t.targetId, t.userId).where(sql`not ${t.resolved}`)],
);

export const ownerPlans = pgTable('owner_plans', {
  id: text('id').primaryKey(),
  hostelId: text('hostel_id')
    .notNull()
    .unique()
    .references(() => hostels.id, { onDelete: 'cascade' }),
  plan: ownerPlanTierEnum('plan').notNull().default('free'),
  /** Plan requested but not yet in force (a partner application, or a downgrade at month end). */
  pendingPlan: ownerPlanTierEnum('pending_plan'),
  /** When a downgrade takes effect (null for a partner application, which waits on admin). */
  pendingPlanOn: day('pending_plan_on'),
  startDate: day('start_date').notNull(),
  trialEndsOn: day('trial_ends_on'),
  /** Set when unpaid owner bills drop the hostel to the Free feature set. */
  suspended: boolean('suspended').notNull().default(false),
  createdAt: createdAt(),
});

export const ownerInvoices = pgTable(
  'owner_invoices',
  {
    id: text('id').primaryKey(),
    ownerPlanId: text('owner_plan_id')
      .notNull()
      .references(() => ownerPlans.id, { onDelete: 'cascade' }),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    plan: ownerPlanTierEnum('plan').notNull(),
    periodStart: day('period_start').notNull(),
    periodEnd: day('period_end').notNull(),
    /** What is payable: the plan price less `creditAmount`, or the used share of a month an upgrade cut short. */
    amount: integer('amount').notNull(),
    /** Unused days already paid for on the previous plan, taken off this bill (upgrades). */
    creditAmount: integer('credit_amount').notNull().default(0),
    /** What a credit or a shortened period is for, shown on the bill. */
    note: text('note'),
    status: invoiceStatusEnum('status').notNull().default('due'),
    dueDate: day('due_date').notNull(),
    razorpayOrderId: text('razorpay_order_id').unique(),
    razorpayPaymentId: text('razorpay_payment_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** How the bill was settled: a payment mode when paid, `waived` when an admin waived it (status void). */
    paymentMode: paymentModeEnum('payment_mode'),
    createdAt: createdAt(),
  },
  (t) => [
    // One live bill per plan tier and period. The tier is part of the key because an upgrade on the first day of a
    // paid month starts the new plan's month on the same day as the old one (the old bill's unused days are credited).
    uniqueIndex('owner_invoices_plan_tier_period')
      .on(t.ownerPlanId, t.periodStart, t.plan)
      .where(sql`${t.status} <> 'void'`),
    check('owner_invoices_amounts_nonneg', sql`${t.amount} >= 0 and ${t.creditAmount} >= 0`),
    // Paid bills say how they were paid; a void bill is either waived by an admin or dropped by the system (null).
    check(
      'owner_invoices_payment_mode_status',
      sql`(${t.status} = 'paid' and ${t.paymentMode} is not null and ${t.paymentMode} <> 'waived') or (${t.status} = 'void' and (${t.paymentMode} is null or ${t.paymentMode} = 'waived')) or (${t.status} = 'due' and ${t.paymentMode} is null)`,
    ),
  ],
);

/**
 * A payment we received but could not apply, because its bill stopped being payable while the payment was on its way
 * (the bed hold expired and the bed went, the plan changed, an admin waived the bill, or the bill was already paid).
 * The money is owed back until an admin marks it refunded. One row per Razorpay payment, so retried webhooks and the
 * checkout callback can never record it twice.
 */
export const paymentExceptions = pgTable(
  'payment_exceptions',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id').references(() => invoices.id),
    ownerInvoiceId: text('owner_invoice_id').references(() => ownerInvoices.id),
    /** Who paid: the tenant, or the owner for a plan bill. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id),
    amount: integer('amount').notNull(),
    paymentMode: paymentModeEnum('payment_mode').notNull(),
    reason: paymentExceptionReasonEnum('reason').notNull(),
    status: paymentExceptionStatusEnum('status').notNull().default('refund_due'),
    razorpayOrderId: text('razorpay_order_id').notNull(),
    razorpayPaymentId: text('razorpay_payment_id').notNull().unique(),
    createdAt: createdAt(),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundedBy: text('refunded_by').references(() => users.id, { onDelete: 'set null' }),
    refundNote: text('refund_note'),
  },
  (t) => [
    index('payment_exceptions_status_idx').on(t.status, t.createdAt),
    check('payment_exceptions_one_bill', sql`num_nonnulls(${t.invoiceId}, ${t.ownerInvoiceId}) = 1`),
    check('payment_exceptions_paid_mode', sql`${t.paymentMode} <> 'waived'`),
    check('payment_exceptions_refunded', sql`(${t.status} = 'refunded') = (${t.refundedAt} is not null)`),
  ],
);

export const rentRecords = pgTable(
  'rent_records',
  {
    id: text('id').primaryKey(),
    residencyId: text('residency_id')
      .notNull()
      .references(() => residencies.id, { onDelete: 'cascade' }),
    month: text('month').notNull(),
    amountDue: integer('amount_due').notNull(),
    amountPaid: integer('amount_paid').notNull().default(0),
    paidOn: day('paid_on'),
    method: rentMethodEnum('method'),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [unique('rent_records_residency_month').on(t.residencyId, t.month)],
);

/** One row per resident per liked post. */
export const communityPostLikes = pgTable(
  'community_post_likes',
  {
    postId: text('post_id')
      .notNull()
      .references(() => communityPosts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

/** Daily page-view counter per hostel, for owner insights. */
export const hostelViews = pgTable(
  'hostel_views',
  {
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    day: day('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.hostelId, t.day] })],
);

// ---------------------------------------------------------------------------
// Partner applications and the admin audit log.

/** One row per partner application: the in-person inspection checklist and the decision. */
export const partnerApplications = pgTable(
  'partner_applications',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    status: partnerStatusEnum('status').notNull().default('applied'),
    /** Ids of the PARTNER_STANDARDS the inspector ticked. */
    checklist: jsonb('checklist').$type<string[]>().notNull().default([]),
    note: text('note').notNull().default(''),
    reason: text('reason'),
    /** A visit after a verified partner moved (not an application): it renews the check, not the partnership. */
    recheck: boolean('recheck').notNull().default(false),
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    index('partner_applications_hostel_idx').on(t.hostelId, t.appliedAt),
    uniqueIndex('partner_applications_one_open').on(t.hostelId).where(sql`${t.status} = 'applied'`),
  ],
);

/** What admins did, newest first in the console. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    summary: text('summary').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('audit_events_created_idx').on(t.createdAt), index('audit_events_target_idx').on(t.targetType, t.targetId)],
);

/**
 * Material edits of live listings (name, address, area, map pin, gender, food, contact numbers), with what each field
 * was and became, so admins can see a listing change after they approved it.
 */
export const listingChanges = pgTable(
  'listing_changes',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    changedBy: text('changed_by').references(() => users.id, { onDelete: 'set null' }),
    /** Field name → [before, after]. */
    changes: jsonb('changes').$type<Record<string, [unknown, unknown]>>().notNull(),
    /** The address or pin of a verified partner moved, so its in-person check needs doing again. */
    partnerRecheck: boolean('partner_recheck').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('listing_changes_created_idx').on(t.createdAt), index('listing_changes_hostel_idx').on(t.hostelId, t.createdAt)],
);
