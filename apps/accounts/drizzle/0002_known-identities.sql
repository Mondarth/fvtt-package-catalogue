CREATE TABLE "known_identities" (
	"hash" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"introductory_claimed_at" timestamp with time zone,
	"purchases_refused_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "subscription_offers" ADD COLUMN "introductory" boolean DEFAULT false NOT NULL;