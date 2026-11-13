CREATE TABLE IF NOT EXISTS "listing_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"changed_by" text,
	"changes" jsonb NOT NULL,
	"partner_recheck" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_reports" DROP CONSTRAINT "content_reports_target_user";--> statement-breakpoint
ALTER TABLE "review_flags" DROP CONSTRAINT "review_flags_review_user";--> statement-breakpoint
ALTER TABLE "hostels" ADD COLUMN "partner_recheck_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partner_applications" ADD COLUMN "recheck" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listing_changes" ADD CONSTRAINT "listing_changes_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listing_changes" ADD CONSTRAINT "listing_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_changes_created_idx" ON "listing_changes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_changes_hostel_idx" ON "listing_changes" USING btree ("hostel_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_reports_one_open" ON "content_reports" USING btree ("target_type","target_id","user_id") WHERE not "content_reports"."resolved";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_flags_one_open" ON "review_flags" USING btree ("review_id","user_id") WHERE not "review_flags"."resolved";