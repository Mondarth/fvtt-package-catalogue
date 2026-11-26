ALTER TABLE "sessions" ADD COLUMN "return_to" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "return_site" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "return_at" timestamp with time zone;