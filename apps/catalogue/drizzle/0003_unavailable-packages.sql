CREATE TYPE "public"."unavailable_reason" AS ENUM('archived', 'gone');--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "unavailable" "unavailable_reason";--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "unavailable_note" text;