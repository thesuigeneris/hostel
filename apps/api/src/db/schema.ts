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
  MEAL_PLANS,
  MEALS,
  MOVE_STATUSES,
  PARTNER_STATUSES,
  PAYOUT_STATUSES,
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
export const payoutStatusEnum = pgEnum('payout_status', PAYOUT_STATUSES);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const day = (name: string) => date(name, { mode: 'string' });

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull().default(''),
  email: text('email'),
  role: roleEnum('role').notNull().default('tenant'),
  createdAt: createdAt(),
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
  (t) => [index('visit_requests_hostel_idx').on(t.hostelId)],
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
    createdAt: createdAt(),
  },
  (t) => [
    index('invoices_user_idx').on(t.userId),
    index('invoices_hostel_paid_idx').on(t.hostelId, t.paidAt),
    // Voided bills are regenerated for the same period, so uniqueness ignores them.
    uniqueIndex('invoices_subscription_period')
      .on(t.subscriptionId, t.periodStart)
      .where(sql`${t.status} <> 'void'`),
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
