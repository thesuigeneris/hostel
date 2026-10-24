CREATE TYPE "public"."diet" AS ENUM('veg', 'non-veg');--> statement-breakpoint
CREATE TYPE "public"."gender_type" AS ENUM('boys', 'girls', 'coliving');--> statement-breakpoint
CREATE TYPE "public"."hostel_status" AS ENUM('draft', 'pending', 'live', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('due', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."issue_category" AS ENUM('food', 'cleanliness', 'maintenance', 'safety', 'wifi', 'water', 'staff', 'other');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'acknowledged', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."meal" AS ENUM('breakfast', 'lunch', 'dinner');--> statement-breakpoint
CREATE TYPE "public"."meal_plan" AS ENUM('full', 'two-meals', 'none');--> statement-breakpoint
CREATE TYPE "public"."move_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."owner_plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('none', 'applied', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."post_kind" AS ENUM('post', 'announcement');--> statement-breakpoint
CREATE TYPE "public"."residency_source" AS ENUM('subscription', 'owner', 'claim');--> statement-breakpoint
CREATE TYPE "public"."residency_status" AS ENUM('pending', 'active', 'ended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('published', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('tenant', 'owner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."saas_invoice_status" AS ENUM('due', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."sharing" AS ENUM('private', '2-sharing', '3-sharing', '4-sharing');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'cancelled', 'ended', 'expired');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('new', 'contacted', 'closed');--> statement-breakpoint
CREATE TABLE "food_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cuisine" text NOT NULL,
	"logo_url" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_views" (
	"hostel_id" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "hostel_views_hostel_id_day_pk" PRIMARY KEY("hostel_id","day")
);
--> statement-breakpoint
CREATE TABLE "hostels" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"city" text NOT NULL,
	"area" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"gender_type" "gender_type" NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact_phone" text NOT NULL,
	"whatsapp_phone" text,
	"food_available" boolean DEFAULT false NOT NULL,
	"status" "hostel_status" DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"partner_status" "partner_status" DEFAULT 'none' NOT NULL,
	"platform_fee_pct" integer DEFAULT 10 NOT NULL,
	"owner_plan" "owner_plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"user_id" text NOT NULL,
	"hostel_id" text NOT NULL,
	"room_type_id" text NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_upvotes" (
	"issue_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "issue_upvotes_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"category" "issue_category" NOT NULL,
	"severity" "issue_severity" DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_skips" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"date" date NOT NULL,
	"meal" "meal" NOT NULL,
	"credit_amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_week_id" text NOT NULL,
	"date" date NOT NULL,
	"meal" "meal" NOT NULL,
	"veg_dish" text NOT NULL,
	"non_veg_dish" text,
	"food_partner_id" text
);
--> statement-breakpoint
CREATE TABLE "menu_weeks" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"week_start" date NOT NULL,
	"theme" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "move_requests" (
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
CREATE TABLE "otp_codes" (
	"phone" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hostel_id" text NOT NULL,
	"period_month" text NOT NULL,
	"gross_amount" integer NOT NULL,
	"platform_fee" integer NOT NULL,
	"net_amount" integer NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"author_id" text NOT NULL,
	"kind" "post_kind" DEFAULT 'post' NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rent_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"residency_id" text NOT NULL,
	"period_month" text NOT NULL,
	"amount" integer NOT NULL,
	"paid_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residencies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hostel_id" text NOT NULL,
	"subscription_id" text,
	"room_label" text,
	"source" "residency_source" NOT NULL,
	"status" "residency_status" DEFAULT 'pending' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"monthly_rent" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"residency_id" text,
	"overall" integer NOT NULL,
	"food" integer,
	"cleanliness" integer NOT NULL,
	"safety" integer NOT NULL,
	"value" integer NOT NULL,
	"staff" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"owner_reply" text,
	"owner_replied_at" timestamp with time zone,
	"status" "review_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"sharing" "sharing" NOT NULL,
	"monthly_rent" integer NOT NULL,
	"advance_amount" integer DEFAULT 0 NOT NULL,
	"total_beds" integer NOT NULL,
	"beds_available" integer NOT NULL,
	CONSTRAINT "room_types_beds_check" CHECK ("room_types"."beds_available" >= 0 AND "room_types"."beds_available" <= "room_types"."total_beds")
);
--> statement-breakpoint
CREATE TABLE "saas_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"plan" "owner_plan" NOT NULL,
	"period_month" text NOT NULL,
	"amount" integer NOT NULL,
	"status" "saas_invoice_status" DEFAULT 'due' NOT NULL,
	"due_date" date NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
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
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text,
	"role" "role" DEFAULT 'tenant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "visit_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"preferred_date" date NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" "visit_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hostel_photos" ADD CONSTRAINT "hostel_photos_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_views" ADD CONSTRAINT "hostel_views_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_upvotes" ADD CONSTRAINT "issue_upvotes_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_upvotes" ADD CONSTRAINT "issue_upvotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_skips" ADD CONSTRAINT "meal_skips_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_food_partner_id_food_partners_id_fk" FOREIGN KEY ("food_partner_id") REFERENCES "public"."food_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_weeks" ADD CONSTRAINT "menu_weeks_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_from_hostel_id_hostels_id_fk" FOREIGN KEY ("from_hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_from_room_type_id_room_types_id_fk" FOREIGN KEY ("from_room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_to_hostel_id_hostels_id_fk" FOREIGN KEY ("to_hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_requests" ADD CONSTRAINT "move_requests_to_room_type_id_room_types_id_fk" FOREIGN KEY ("to_room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residencies" ADD CONSTRAINT "residencies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residencies" ADD CONSTRAINT "residencies_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residencies" ADD CONSTRAINT "residencies_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hostel_photos_hostel_idx" ON "hostel_photos" USING btree ("hostel_id");--> statement-breakpoint
CREATE INDEX "hostels_owner_idx" ON "hostels" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "hostels_status_area_idx" ON "hostels" USING btree ("status","city","area");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_sub_period_uq" ON "invoices" USING btree ("subscription_id","period_start") WHERE "invoices"."status" <> 'void';--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_hostel_paid_idx" ON "invoices" USING btree ("hostel_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_order_uq" ON "invoices" USING btree ("razorpay_order_id");--> statement-breakpoint
CREATE INDEX "issue_comments_issue_idx" ON "issue_comments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issues_hostel_idx" ON "issues" USING btree ("hostel_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_skips_sub_date_meal_uq" ON "meal_skips" USING btree ("subscription_id","date","meal");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_week_date_meal_uq" ON "menu_items" USING btree ("menu_week_id","date","meal");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_weeks_hostel_week_uq" ON "menu_weeks" USING btree ("hostel_id","week_start");--> statement-breakpoint
CREATE INDEX "move_requests_sub_idx" ON "move_requests" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "move_requests_one_scheduled_uq" ON "move_requests" USING btree ("subscription_id") WHERE "move_requests"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "otp_sends_phone_sent_idx" ON "otp_sends" USING btree ("phone","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_hostel_month_uq" ON "payouts" USING btree ("hostel_id","period_month");--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_hostel_idx" ON "posts" USING btree ("hostel_id","created_at");--> statement-breakpoint
CREATE INDEX "rent_payments_residency_idx" ON "rent_payments" USING btree ("residency_id");--> statement-breakpoint
CREATE INDEX "residencies_hostel_idx" ON "residencies" USING btree ("hostel_id","status");--> statement-breakpoint
CREATE INDEX "residencies_user_idx" ON "residencies" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "residencies_one_open_per_user_hostel_uq" ON "residencies" USING btree ("user_id","hostel_id") WHERE "residencies"."status" in ('pending', 'active');--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_user_hostel_uq" ON "reviews" USING btree ("user_id","hostel_id");--> statement-breakpoint
CREATE INDEX "reviews_hostel_idx" ON "reviews" USING btree ("hostel_id","status");--> statement-breakpoint
CREATE INDEX "room_types_hostel_idx" ON "room_types" USING btree ("hostel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saas_invoices_hostel_month_uq" ON "saas_invoices" USING btree ("hostel_id","period_month") WHERE "saas_invoices"."status" <> 'void';--> statement-breakpoint
CREATE UNIQUE INDEX "saas_invoices_order_uq" ON "saas_invoices" USING btree ("razorpay_order_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_hostel_idx" ON "subscriptions" USING btree ("hostel_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_open_per_user_uq" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" in ('pending', 'active');--> statement-breakpoint
CREATE INDEX "visit_requests_hostel_idx" ON "visit_requests" USING btree ("hostel_id");--> statement-breakpoint
CREATE INDEX "visit_requests_user_idx" ON "visit_requests" USING btree ("user_id");