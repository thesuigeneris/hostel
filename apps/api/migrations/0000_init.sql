CREATE TYPE "public"."role" AS ENUM('tenant', 'owner', 'admin');
CREATE TYPE "public"."sharing_type" AS ENUM('2-sharing', '3-sharing', '4-sharing', 'private');
CREATE TYPE "public"."meal_plan" AS ENUM('full', 'breakfast-only', 'none');
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'paused', 'cancelled');
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'paid');

CREATE TABLE "users" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "phone" text NOT NULL,
  "email" text,
  "role" "role" DEFAULT 'tenant' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_phone_unique" UNIQUE("phone")
);

CREATE TABLE "hostels" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text REFERENCES "users"("id"),
  "name" text NOT NULL,
  "area" text NOT NULL,
  "city" text NOT NULL,
  "image_url" text NOT NULL,
  "monthly_rent" integer NOT NULL,
  "food_included" boolean DEFAULT true NOT NULL,
  "sharing_type" "sharing_type" NOT NULL,
  "amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "beds_available" integer NOT NULL,
  "total_beds" integer NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "hostel_id" text NOT NULL REFERENCES "hostels"("id"),
  "start_date" date NOT NULL,
  "status" "subscription_status" DEFAULT 'pending' NOT NULL,
  "monthly_amount" integer NOT NULL,
  "meal_plan" "meal_plan" NOT NULL,
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "payouts" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL REFERENCES "users"("id"),
  "hostel_id" text NOT NULL REFERENCES "hostels"("id"),
  "period_month" text NOT NULL,
  "gross_amount" integer NOT NULL,
  "platform_fee" integer NOT NULL,
  "net_amount" integer NOT NULL,
  "status" "payout_status" DEFAULT 'pending' NOT NULL,
  "paid_at" timestamp
);

CREATE TABLE "otp_codes" (
  "phone" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "expires_at" timestamp NOT NULL
);

CREATE TABLE "sessions" (
  "token" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
