ALTER TABLE "users" ADD COLUMN "admin_granted_at" timestamp with time zone;--> statement-breakpoint
-- Seeded demo admins were granted by the seed, not by ADMIN_PHONES, so they keep the role.
UPDATE "users" SET "admin_granted_at" = now() WHERE "role" = 'admin' AND "is_demo" = true;
