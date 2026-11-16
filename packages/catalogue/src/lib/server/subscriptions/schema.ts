/**
 * Subscriptions' tables: the offers a subscription is bought by, and the credits that make it, each a span of time a
 * user is subscribed for. A user is subscribed until the latest credit ends (see `store.ts`). No payment details are
 * kept: a credit names its payment provider and the provider's own reference alone, where the invoice is kept.
 *
 * What `subscription_credits` holds of a user is on the website's "What we store" page (`/privacy`): change one,
 * change both. Offers hold nothing of anyone.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';

import { users } from '../accounts/schema.js';

const createdAt = timestamp({ withTimezone: true }).notNull().defaultNow();

/** Where a credit's time came from. */
export const CREDIT_SOURCES = ['grant', 'patreon', 'payment'] as const;
export type CreditSource = (typeof CREDIT_SOURCES)[number];

/**
 * What a subscription is bought by: a period, at a price in each currency. Never changed once made, so that what was
 * bought by it stays as it was: a new price or period is a new offer, and the old one is retired.
 */
export const subscriptionOffers = pgTable('subscription_offers', {
  id: text().primaryKey(),
  /** What it is called where it is offered, such as `12 months`. */
  name: text().notNull(),
  /** Its period: so many calendar months and days. */
  months: integer().notNull().default(0),
  days: integer().notNull().default(0),
  /** Its price in each currency, in the currency's minor unit, such as `{ "GBP": 3000 }` for £30.00. */
  prices: jsonb().$type<Record<string, number>>().notNull(),
  /** The payment providers that offer it; none yet. */
  providers: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** Offered only from and until these, if set. */
  availableFrom: timestamp({ withTimezone: true }),
  availableUntil: timestamp({ withTimezone: true }),
  /** When an admin retired it: it is offered no longer. */
  retiredAt: timestamp({ withTimezone: true }),
  /** The admin who made it. */
  createdBy: text().notNull(),
  createdAt,
});

/** A span of time a user is subscribed for, and where it came from. */
export const subscriptionCredits = pgTable(
  'subscription_credits',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text({ enum: CREDIT_SOURCES }).notNull(),
    /** The payment provider that took the payment, such as `stripe` or `patreon`; none for a grant. */
    provider: text(),
    /** What it was paid with, such as `card` or `btc`; none for a grant or Patreon. */
    method: text(),
    /** The provider's own reference for it, where its invoice is kept. */
    externalRef: text(),
    /** Which of the catalogue's accounts with the provider it was paid to, should there be more than one. */
    providerAccount: text(),
    /** The offer it was bought by. */
    offerId: text().references(() => subscriptionOffers.id),
    /** The period bought or granted: so many calendar months and days. */
    months: integer().notNull().default(0),
    days: integer().notNull().default(0),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    /** The admin who granted it, or changed its end. */
    grantedBy: text(),
    /** Why, as the admin wrote it. */
    note: text(),
    createdAt,
  },
  table => [
    index('subscription_credits_user_id').on(table.userId),
    // One credit for each payment, however often its provider says so.
    uniqueIndex('subscription_credits_provider_ref').on(table.provider, table.externalRef),
  ],
);
