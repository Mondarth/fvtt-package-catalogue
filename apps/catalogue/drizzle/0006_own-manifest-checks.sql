ALTER TABLE "packages" ADD COLUMN "own_version" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "own_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "own_read_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "packages_own_checked_at_index" ON "packages" USING btree ("own_checked_at");