CREATE TYPE "public"."diet" AS ENUM('veg', 'non-veg');--> statement-breakpoint
CREATE TYPE "public"."gender_type" AS ENUM('boys', 'girls', 'coliving');--> statement-breakpoint
CREATE TYPE "public"."hostel_status" AS ENUM('draft', 'pending', 'live', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('due', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."meal" AS ENUM('breakfast', 'lunch', 'dinner');--> statement-breakpoint
CREATE TYPE "public"."meal_plan" AS ENUM('full', 'two-meals', 'none');--> statement-breakpoint
CREATE TYPE "public"."move_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('none', 'applied', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('tenant', 'owner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."sharing" AS ENUM('private', '2-sharing', '3-sharing', '4-sharing');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'cancelled', 'ended', 'expired');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('new', 'contacted', 'closed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cuisine" text DEFAULT '' NOT NULL,
	"logo_url" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostel_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hostels" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"city" text DEFAULT 'Hyderabad' NOT NULL,
	"area" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"gender_type" "gender_type" NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact_phone" text NOT NULL,
	"whatsapp_phone" text,
	"food_available" boolean DEFAULT false NOT NULL,
	"status" "hostel_status" DEFAULT 'draft' NOT NULL,
	"partner_status" "partner_status" DEFAULT 'none' NOT NULL,
	"platform_fee_pct" double precision DEFAULT 10 NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostels_slug_unique" UNIQUE("slug"),
	CONSTRAINT "hostels_fee_pct_range" CHECK ("hostels"."platform_fee_pct" >= 0 and "hostels"."platform_fee_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"user_id" text NOT NULL,
	"hostel_id" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"rent_amount" integer NOT NULL,
	"food_amount" integer NOT NULL,
	"credit_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'due' NOT NULL,
	"due_date" date NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_razorpay_order_id_unique" UNIQUE("razorpay_order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meal_skips" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"date" date NOT NULL,
	"meal" "meal" NOT NULL,
	"credit_amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_skips_sub_date_meal" UNIQUE("subscription_id","date","meal")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_week_id" text NOT NULL,
	"date" date NOT NULL,
	"meal" "meal" NOT NULL,
	"veg_dish" text NOT NULL,
	"non_veg_dish" text,
	"food_partner_id" text,
	CONSTRAINT "menu_items_week_date_meal" UNIQUE("menu_week_id","date","meal")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_weeks" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"week_start" date NOT NULL,
	"theme" text DEFAULT '' NOT NULL,
	CONSTRAINT "menu_weeks_hostel_week" UNIQUE("hostel_id","week_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "move_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"from_hostel_id" text NOT NULL,
	"from_room_type_id" text NOT NULL,
	"to_hostel_id" text NOT NULL,
	"to_room_type_id" text NOT NULL,
	"move_date" date NOT NULL,
	"status" "move_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "otp_codes" (
	"phone" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"send_window_start" timestamp with time zone NOT NULL,
	"send_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hostel_id" text NOT NULL,
	"period_month" text NOT NULL,
	"gross_amount" integer NOT NULL,
	"platform_fee" integer NOT NULL,
	"net_amount" integer NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_hostel_month" UNIQUE("hostel_id","period_month")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_types" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"sharing" "sharing" NOT NULL,
	"monthly_rent" integer NOT NULL,
	"advance_amount" integer DEFAULT 0 NOT NULL,
	"total_beds" integer NOT NULL,
	"beds_available" integer NOT NULL,
	CONSTRAINT "room_types_beds_range" CHECK ("room_types"."beds_available" >= 0 and "room_types"."beds_available" <= "room_types"."total_beds"),
	CONSTRAINT "room_types_amounts_nonneg" CHECK ("room_types"."monthly_rent" >= 0 and "room_types"."advance_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hostel_id" text NOT NULL,
	"room_type_id" text NOT NULL,
	"meal_plan" "meal_plan" NOT NULL,
	"diet" "diet" NOT NULL,
	"status" "subscription_status" DEFAULT 'pending' NOT NULL,
	"start_date" date NOT NULL,
	"cancel_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text,
	"role" "role" DEFAULT 'tenant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visit_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"preferred_date" date NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" "visit_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostel_photos" ADD CONSTRAINT "hostel_photos_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hostels" ADD CONSTRAINT "hostels_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meal_skips" ADD CONSTRAINT "meal_skips_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_food_partner_id_food_partners_id_fk" FOREIGN KEY ("food_partner_id") REFERENCES "public"."food_partners"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_weeks" ADD CONSTRAINT "menu_weeks_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_from_hostel_id_hostels_id_fk" FOREIGN KEY ("from_hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_from_room_type_id_room_types_id_fk" FOREIGN KEY ("from_room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_to_hostel_id_hostels_id_fk" FOREIGN KEY ("to_hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_to_room_type_id_room_types_id_fk" FOREIGN KEY ("to_room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payouts" ADD CONSTRAINT "payouts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payouts" ADD CONSTRAINT "payouts_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_types" ADD CONSTRAINT "room_types_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostel_photos_hostel_idx" ON "hostel_photos" USING btree ("hostel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostels_owner_idx" ON "hostels" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hostels_status_area_idx" ON "hostels" USING btree ("status","area");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_hostel_paid_idx" ON "invoices" USING btree ("hostel_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_subscription_period" ON "invoices" USING btree ("subscription_id","period_start") WHERE "invoices"."status" <> 'void';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "move_requests_subscription_idx" ON "move_requests" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "move_requests_one_scheduled" ON "move_requests" USING btree ("subscription_id") WHERE "move_requests"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_types_hostel_idx" ON "room_types" USING btree ("hostel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_hostel_idx" ON "subscriptions" USING btree ("hostel_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_one_open_per_user" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" in ('pending', 'active');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visit_requests_hostel_idx" ON "visit_requests" USING btree ("hostel_id");