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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
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
export const payoutStatusEnum = pgEnum('payout_status', PAYOUT_STATUSES);
export const ownerPlanEnum = pgEnum('owner_plan', OWNER_PLANS);
export const saasInvoiceStatusEnum = pgEnum('saas_invoice_status', SAAS_INVOICE_STATUSES);
export const residencySourceEnum = pgEnum('residency_source', RESIDENCY_SOURCES);
export const residencyStatusEnum = pgEnum('residency_status', RESIDENCY_STATUSES);
export const issueCategoryEnum = pgEnum('issue_category', ISSUE_CATEGORIES);
export const issueSeverityEnum = pgEnum('issue_severity', ISSUE_SEVERITIES);
export const issueStatusEnum = pgEnum('issue_status', ISSUE_STATUSES);
export const postKindEnum = pgEnum('post_kind', POST_KINDS);
export const reviewStatusEnum = pgEnum('review_status', REVIEW_STATUSES);

const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });

// ---------- users & auth ----------

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull().default(''),
  email: text('email'),
  role: roleEnum('role').notNull().default('tenant'),
  createdAt: tsz('created_at').notNull().defaultNow(),
});

export const otpCodes = pgTable('otp_codes', {
  phone: text('phone').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: tsz('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
});

/** One row per OTP send, for the 5-per-hour rate limit. */
export const otpSends = pgTable(
  'otp_sends',
  {
    id: text('id').primaryKey(),
    phone: text('phone').notNull(),
    sentAt: tsz('sent_at').notNull().defaultNow(),
  },
  (t) => [index('otp_sends_phone_sent_idx').on(t.phone, t.sentAt)],
);

export const sessions = pgTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: tsz('created_at').notNull().defaultNow(),
    expiresAt: tsz('expires_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ---------- hostels ----------

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
    city: text('city').notNull(),
    area: text('area').notNull(),
    address: text('address').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    genderType: genderTypeEnum('gender_type').notNull(),
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    rules: jsonb('rules').$type<string[]>().notNull().default([]),
    contactPhone: text('contact_phone').notNull(),
    whatsappPhone: text('whatsapp_phone'),
    foodAvailable: boolean('food_available').notNull().default(false),
    status: hostelStatusEnum('status').notNull().default('draft'),
    rejectionReason: text('rejection_reason'),
    partnerStatus: partnerStatusEnum('partner_status').notNull().default('none'),
    platformFeePct: integer('platform_fee_pct').notNull().default(10),
    ownerPlan: ownerPlanEnum('owner_plan').notNull().default('free'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('hostels_owner_idx').on(t.ownerId), index('hostels_status_area_idx').on(t.status, t.city, t.area)],
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
  },
  (t) => [
    index('room_types_hostel_idx').on(t.hostelId),
    check('room_types_beds_check', sql`${t.bedsAvailable} >= 0 AND ${t.bedsAvailable} <= ${t.totalBeds}`),
  ],
);

/** Daily page-view counter for owner insights. */
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
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('visit_requests_hostel_idx').on(t.hostelId), index('visit_requests_user_idx').on(t.userId)],
);

// ---------- food ----------

export const foodPartners = pgTable('food_partners', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cuisine: text('cuisine').notNull(),
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
  (t) => [uniqueIndex('menu_weeks_hostel_week_uq').on(t.hostelId, t.weekStart)],
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
  (t) => [uniqueIndex('menu_items_week_date_meal_uq').on(t.menuWeekId, t.date, t.meal)],
);

// ---------- subscriptions & billing ----------

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
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('subscriptions_hostel_idx').on(t.hostelId, t.status),
    uniqueIndex('subscriptions_one_open_per_user_uq')
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
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    periodStart: day('period_start').notNull(),
    periodEnd: day('period_end').notNull(),
    rentAmount: integer('rent_amount').notNull(),
    foodAmount: integer('food_amount').notNull(),
    creditAmount: integer('credit_amount').notNull().default(0),
    totalAmount: integer('total_amount').notNull(),
    status: invoiceStatusEnum('status').notNull().default('due'),
    dueDate: day('due_date').notNull(),
    razorpayOrderId: text('razorpay_order_id'),
    razorpayPaymentId: text('razorpay_payment_id'),
    paidAt: tsz('paid_at'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Voided invoices can be regenerated for the same period.
    uniqueIndex('invoices_sub_period_uq')
      .on(t.subscriptionId, t.periodStart)
      .where(sql`${t.status} <> 'void'`),
    index('invoices_user_idx').on(t.userId),
    index('invoices_hostel_paid_idx').on(t.hostelId, t.paidAt),
    uniqueIndex('invoices_order_uq').on(t.razorpayOrderId),
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
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('meal_skips_sub_date_meal_uq').on(t.subscriptionId, t.date, t.meal)],
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
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('move_requests_sub_idx').on(t.subscriptionId),
    uniqueIndex('move_requests_one_scheduled_uq')
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
    paidAt: tsz('paid_at'),
  },
  (t) => [uniqueIndex('payouts_hostel_month_uq').on(t.hostelId, t.periodMonth)],
);

// ---------- owner software plan ----------

export const saasInvoices = pgTable(
  'saas_invoices',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    plan: ownerPlanEnum('plan').notNull(),
    periodMonth: text('period_month').notNull(),
    amount: integer('amount').notNull(),
    status: saasInvoiceStatusEnum('status').notNull().default('due'),
    dueDate: day('due_date').notNull(),
    razorpayOrderId: text('razorpay_order_id'),
    razorpayPaymentId: text('razorpay_payment_id'),
    paidAt: tsz('paid_at'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('saas_invoices_hostel_month_uq')
      .on(t.hostelId, t.periodMonth)
      .where(sql`${t.status} <> 'void'`),
    uniqueIndex('saas_invoices_order_uq').on(t.razorpayOrderId),
  ],
);

// ---------- residents & community ----------

export const residencies = pgTable(
  'residencies',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').references(() => subscriptions.id),
    roomLabel: text('room_label'),
    source: residencySourceEnum('source').notNull(),
    status: residencyStatusEnum('status').notNull().default('pending'),
    startDate: day('start_date').notNull(),
    endDate: day('end_date'),
    monthlyRent: integer('monthly_rent'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('residencies_hostel_idx').on(t.hostelId, t.status),
    index('residencies_user_idx').on(t.userId),
    uniqueIndex('residencies_one_open_per_user_hostel_uq')
      .on(t.userId, t.hostelId)
      .where(sql`${t.status} in ('pending', 'active')`),
  ],
);

export const rentPayments = pgTable(
  'rent_payments',
  {
    id: text('id').primaryKey(),
    residencyId: text('residency_id')
      .notNull()
      .references(() => residencies.id, { onDelete: 'cascade' }),
    periodMonth: text('period_month').notNull(),
    amount: integer('amount').notNull(),
    paidOn: day('paid_on').notNull(),
    note: text('note').notNull().default(''),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('rent_payments_residency_idx').on(t.residencyId)],
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
    residencyId: text('residency_id').references(() => residencies.id),
    overall: integer('overall').notNull(),
    food: integer('food'),
    cleanliness: integer('cleanliness').notNull(),
    safety: integer('safety').notNull(),
    value: integer('value').notNull(),
    staff: integer('staff').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    ownerReply: text('owner_reply'),
    ownerRepliedAt: tsz('owner_replied_at'),
    status: reviewStatusEnum('status').notNull().default('published'),
    createdAt: tsz('created_at').notNull().defaultNow(),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('reviews_user_hostel_uq').on(t.userId, t.hostelId), index('reviews_hostel_idx').on(t.hostelId, t.status)],
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
    anonymous: boolean('anonymous').notNull().default(false),
    isPublic: boolean('is_public').notNull().default(true),
    category: issueCategoryEnum('category').notNull(),
    severity: issueSeverityEnum('severity').notNull().default('medium'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    photoUrls: jsonb('photo_urls').$type<string[]>().notNull().default([]),
    status: issueStatusEnum('status').notNull().default('open'),
    acknowledgedAt: tsz('acknowledged_at'),
    firstResponseAt: tsz('first_response_at'),
    resolvedAt: tsz('resolved_at'),
    closedAt: tsz('closed_at'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('issues_hostel_idx').on(t.hostelId, t.status, t.createdAt)],
);

export const issueComments = pgTable(
  'issue_comments',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('issue_comments_issue_idx').on(t.issueId)],
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

export const posts = pgTable(
  'posts',
  {
    id: text('id').primaryKey(),
    hostelId: text('hostel_id')
      .notNull()
      .references(() => hostels.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    kind: postKindEnum('kind').notNull().default('post'),
    body: text('body').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('posts_hostel_idx').on(t.hostelId, t.createdAt)],
);

export const postComments = pgTable(
  'post_comments',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('post_comments_post_idx').on(t.postId)],
);

export const postLikes = pgTable(
  'post_likes',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);
