CREATE TABLE IF NOT EXISTS "login_throttle" (
	"phone" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
-- Every account before this migration was created by a successful OTP verify, so its phone is verified.
UPDATE "users" SET "phone_verified_at" = "created_at" WHERE "phone_verified_at" IS NULL;
