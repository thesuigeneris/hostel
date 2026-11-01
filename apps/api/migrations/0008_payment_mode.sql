CREATE TYPE "public"."payment_exception_reason" AS ENUM('bed_taken', 'has_other_plan', 'hostel_unavailable', 'bill_cancelled', 'bill_waived', 'duplicate_payment');--> statement-breakpoint
CREATE TYPE "public"."payment_exception_status" AS ENUM('refund_due', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('razorpay_live', 'razorpay_test', 'simulated', 'waived');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text,
	"owner_invoice_id" text,
	"user_id" text NOT NULL,
	"hostel_id" text NOT NULL,
	"amount" integer NOT NULL,
	"payment_mode" "payment_mode" NOT NULL,
	"reason" "payment_exception_reason" NOT NULL,
	"status" "payment_exception_status" DEFAULT 'refund_due' NOT NULL,
	"razorpay_order_id" text NOT NULL,
	"razorpay_payment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refunded_at" timestamp with time zone,
	"refunded_by" text,
	"refund_note" text,
	CONSTRAINT "payment_exceptions_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id"),
	CONSTRAINT "payment_exceptions_one_bill" CHECK (num_nonnulls("payment_exceptions"."invoice_id", "payment_exceptions"."owner_invoice_id") = 1),
	CONSTRAINT "payment_exceptions_paid_mode" CHECK ("payment_exceptions"."payment_mode" <> 'waived'),
	CONSTRAINT "payment_exceptions_refunded" CHECK (("payment_exceptions"."status" = 'refunded') = ("payment_exceptions"."refunded_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_mode" "payment_mode";--> statement-breakpoint
ALTER TABLE "owner_invoices" ADD COLUMN "payment_mode" "payment_mode";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_owner_invoice_id_owner_invoices_id_fk" FOREIGN KEY ("owner_invoice_id") REFERENCES "public"."owner_invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_exceptions_status_idx" ON "payment_exceptions" USING btree ("status","created_at");--> statement-breakpoint
-- Backfill (added by hand): how the bills paid before this migration were settled, so the checks below hold.
-- Paid with no Razorpay payment id, or with the ids the payment stub and the demo seed make (pay_stub_, pay_seed_,
-- order_stub_, order_seed_): simulated. Any other paid bill went through Razorpay. No live Razorpay account had been
-- connected before this migration, so those are recorded as test mode, which is never counted as real money. An
-- instance that did take live payments before this migration must set those rows to 'razorpay_live' by hand.
UPDATE "invoices" SET "payment_mode" = CASE
    WHEN "razorpay_payment_id" IS NULL
      OR starts_with("razorpay_payment_id", 'pay_stub_') OR starts_with("razorpay_payment_id", 'pay_seed_')
      OR starts_with(coalesce("razorpay_order_id", ''), 'order_stub_') OR starts_with(coalesce("razorpay_order_id", ''), 'order_seed_')
    THEN 'simulated'::"payment_mode" ELSE 'razorpay_test'::"payment_mode" END
WHERE "status" = 'paid';--> statement-breakpoint
UPDATE "owner_invoices" SET "payment_mode" = CASE
    WHEN "razorpay_payment_id" IS NULL
      OR starts_with("razorpay_payment_id", 'pay_stub_') OR starts_with("razorpay_payment_id", 'pay_seed_')
      OR starts_with(coalesce("razorpay_order_id", ''), 'order_stub_') OR starts_with(coalesce("razorpay_order_id", ''), 'order_seed_')
    THEN 'simulated'::"payment_mode" ELSE 'razorpay_test'::"payment_mode" END
WHERE "status" = 'paid';--> statement-breakpoint
-- Waived owner bills are the void ones the audit log records an admin waiving; other void bills were dropped by a plan change.
UPDATE "owner_invoices" SET "payment_mode" = 'waived'
WHERE "status" = 'void' AND "id" IN (SELECT "target_id" FROM "audit_events" WHERE "action" = 'owner_invoice.void');--> statement-breakpoint
-- Pending payouts were built from every paid bill. After the backfill above none of those bills is real money, so no
-- pending payout has real money behind it: drop them, and generating the month again rebuilds any that should exist.
-- Paid payouts record transfers that happened and stay.
DELETE FROM "payouts" WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_mode_status" CHECK (("invoices"."status" = 'paid' and "invoices"."payment_mode" is not null and "invoices"."payment_mode" <> 'waived') or ("invoices"."status" <> 'paid' and "invoices"."payment_mode" is null));--> statement-breakpoint
ALTER TABLE "owner_invoices" ADD CONSTRAINT "owner_invoices_payment_mode_status" CHECK (("owner_invoices"."status" = 'paid' and "owner_invoices"."payment_mode" is not null and "owner_invoices"."payment_mode" <> 'waived') or ("owner_invoices"."status" = 'void' and ("owner_invoices"."payment_mode" is null or "owner_invoices"."payment_mode" = 'waived')) or ("owner_invoices"."status" = 'due' and "owner_invoices"."payment_mode" is null));