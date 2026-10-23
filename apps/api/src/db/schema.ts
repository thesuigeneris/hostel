import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
  date,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['tenant', 'owner', 'admin']);
export const sharingTypeEnum = pgEnum('sharing_type', ['2-sharing', '3-sharing', '4-sharing', 'private']);
export const mealPlanEnum = pgEnum('meal_plan', ['full', 'breakfast-only', 'none']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'pending',
  'active',
  'paused',
  'cancelled',
]);
export const payoutStatusEnum = pgEnum('payout_status', ['pending', 'paid']);

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  phone: text('phone').notNull().unique(),
  email: text('email'),
  role: roleEnum('role').notNull().default('tenant'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const hostels = pgTable('hostels', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id),
  name: text('name').notNull(),
  area: text('area').notNull(),
  city: text('city').notNull(),
  imageUrl: text('image_url').notNull(),
  monthlyRent: integer('monthly_rent').notNull(),
  foodIncluded: boolean('food_included').notNull().default(true),
  sharingType: sharingTypeEnum('sharing_type').notNull(),
  amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
  bedsAvailable: integer('beds_available').notNull(),
  totalBeds: integer('total_beds').notNull(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  hostelId: text('hostel_id').notNull().references(() => hostels.id),
  startDate: date('start_date').notNull(),
  status: subscriptionStatusEnum('status').notNull().default('pending'),
  monthlyAmount: integer('monthly_amount').notNull(),
  mealPlan: mealPlanEnum('meal_plan').notNull(),
  razorpayOrderId: text('razorpay_order_id'),
  razorpayPaymentId: text('razorpay_payment_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const payouts = pgTable('payouts', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  hostelId: text('hostel_id').notNull().references(() => hostels.id),
  periodMonth: text('period_month').notNull(),
  grossAmount: integer('gross_amount').notNull(),
  platformFee: integer('platform_fee').notNull(),
  netAmount: integer('net_amount').notNull(),
  status: payoutStatusEnum('status').notNull().default('pending'),
  paidAt: timestamp('paid_at'),
});

export const otpCodes = pgTable('otp_codes', {
  phone: text('phone').primaryKey(),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
