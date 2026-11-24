CREATE TABLE "subscription_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"provider" text,
	"method" text,
	"external_ref" text,
	"provider_account" text,
	"offer_id" text,
	"months" integer DEFAULT 0 NOT NULL,
	"days" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"granted_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"months" integer DEFAULT 0 NOT NULL,
	"days" integer DEFAULT 0 NOT NULL,
	"prices" jsonb NOT NULL,
	"providers" text[] DEFAULT '{}'::text[] NOT NULL,
	"available_from" timestamp with time zone,
	"available_until" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_credits" ADD CONSTRAINT "subscription_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_credits" ADD CONSTRAINT "subscription_credits_offer_id_subscription_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."subscription_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_credits_user_id" ON "subscription_credits" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_credits_provider_ref" ON "subscription_credits" USING btree ("provider","external_ref");