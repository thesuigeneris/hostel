CREATE TYPE "public"."issue_category" AS ENUM('maintenance', 'cleanliness', 'food', 'safety', 'wifi', 'water', 'electricity', 'other');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'acknowledged', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."owner_plan_tier" AS ENUM('free', 'pro', 'partner');--> statement-breakpoint
CREATE TYPE "public"."post_kind" AS ENUM('general', 'food', 'event', 'lost_found', 'buy_sell', 'announcement');--> statement-breakpoint
CREATE TYPE "public"."rent_method" AS ENUM('cash', 'upi', 'bank', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('post', 'comment');--> statement-breakpoint
CREATE TYPE "public"."residency_source" AS ENUM('subscription', 'owner');--> statement-breakpoint
CREATE TYPE "public"."residency_status" AS ENUM('invited', 'active', 'ended', 'declined');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"author_id" text NOT NULL,
	"kind" "post_kind" DEFAULT 'general' NOT NULL,
	"body" text NOT NULL,
	"photo_url" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" text NOT NULL,
	"hostel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_reports_target_user" UNIQUE("target_type","target_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issue_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"author_id" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"from_status" "issue_status",
	"to_status" "issue_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issue_upvotes" (
	"issue_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "issue_upvotes_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issues" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"residency_id" text NOT NULL,
	"category" "issue_category" NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"photo_url" text,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "owner_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_plan_id" text NOT NULL,
	"hostel_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"plan" "owner_plan_tier" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'due' NOT NULL,
	"due_date" date NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_invoices_razorpay_order_id_unique" UNIQUE("razorpay_order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "owner_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"plan" "owner_plan_tier" DEFAULT 'free' NOT NULL,
	"pending_plan" "owner_plan_tier",
	"pending_plan_on" date,
	"start_date" date NOT NULL,
	"trial_ends_on" date,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_plans_hostel_id_unique" UNIQUE("hostel_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rent_records" (
	"id" text PRIMARY KEY NOT NULL,
	"residency_id" text NOT NULL,
	"month" text NOT NULL,
	"amount_due" integer NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"paid_on" date,
	"method" "rent_method",
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_records_residency_month" UNIQUE("residency_id","month")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "residencies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"phone" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"hostel_id" text NOT NULL,
	"room_type_id" text,
	"source" "residency_source" NOT NULL,
	"subscription_id" text,
	"monthly_rent" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "residency_status" NOT NULL,
	"directory_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_flags_review_user" UNIQUE("review_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"residency_id" text NOT NULL,
	"rating" integer NOT NULL,
	"cleanliness" integer NOT NULL,
	"food" integer,
	"safety" integer NOT NULL,
	"responsiveness" integer NOT NULL,
	"body" text NOT NULL,
	"owner_reply" text,
	"owner_replied_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_hostel_user" UNIQUE("hostel_id","user_id"),
	CONSTRAINT "reviews_ratings_range" CHECK ("reviews"."rating" between 1 and 5 and "reviews"."cleanliness" between 1 and 5 and "reviews"."safety" between 1 and 5 and "reviews"."responsiveness" between 1 and 5 and ("reviews"."food" is null or "reviews"."food" between 1 and 5))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_updates" ADD CONSTRAINT "issue_updates_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_updates" ADD CONSTRAINT "issue_updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_upvotes" ADD CONSTRAINT "issue_upvotes_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_upvotes" ADD CONSTRAINT "issue_upvotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issues" ADD CONSTRAINT "issues_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issues" ADD CONSTRAINT "issues_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issues" ADD CONSTRAINT "issues_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "owner_invoices" ADD CONSTRAINT "owner_invoices_owner_plan_id_owner_plans_id_fk" FOREIGN KEY ("owner_plan_id") REFERENCES "public"."owner_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "owner_invoices" ADD CONSTRAINT "owner_invoices_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "owner_invoices" ADD CONSTRAINT "owner_invoices_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "owner_plans" ADD CONSTRAINT "owner_plans_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rent_records" ADD CONSTRAINT "rent_records_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "residencies" ADD CONSTRAINT "residencies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "residencies" ADD CONSTRAINT "residencies_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "residencies" ADD CONSTRAINT "residencies_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "residencies" ADD CONSTRAINT "residencies_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_comments_post_idx" ON "community_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_posts_hostel_idx" ON "community_posts" USING btree ("hostel_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_updates_issue_idx" ON "issue_updates" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_hostel_idx" ON "issues" USING btree ("hostel_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "owner_invoices_plan_period" ON "owner_invoices" USING btree ("owner_plan_id","period_start") WHERE "owner_invoices"."status" <> 'void';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "residencies_hostel_idx" ON "residencies" USING btree ("hostel_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "residencies_user_idx" ON "residencies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "residencies_phone_idx" ON "residencies" USING btree ("phone");