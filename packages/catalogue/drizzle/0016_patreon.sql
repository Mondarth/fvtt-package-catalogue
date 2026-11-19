CREATE TABLE "catalogue_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patreon_memberships" (
	"user_id" text PRIMARY KEY NOT NULL,
	"patron_status" text,
	"amount" integer,
	"next_charge_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"asked_at" timestamp with time zone NOT NULL,
	"failure" text
);
--> statement-breakpoint
ALTER TABLE "patreon_memberships" ADD CONSTRAINT "patreon_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;