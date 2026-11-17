CREATE TYPE "public"."food_change_status" AS ENUM('scheduled', 'applied', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_plan_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"meal_plan" "meal_plan" NOT NULL,
	"diet" "diet" NOT NULL,
	"effective_from" date NOT NULL,
	"status" "food_change_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_plan_changes" ADD CONSTRAINT "food_plan_changes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_plan_changes_subscription_idx" ON "food_plan_changes" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "food_plan_changes_one_scheduled" ON "food_plan_changes" USING btree ("subscription_id") WHERE "food_plan_changes"."status" = 'scheduled';