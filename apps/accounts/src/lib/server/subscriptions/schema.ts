/**
 * Subscriptions' tables: the offers a subscription is bought by, and the credits that make it, each a span of time a
 * user is subscribed for. A user is subscribed until the latest credit ends (see `store.ts`). No payment details are
 * kept: a credit names its payment provider and the provider's own reference alone, where the invoice is kept.
 *
 * A user with a Patreon account linked is subscribed too while Patreon says they are a member of Mondarth's Patreon,
 * pledging the least amount the admins set: Patreon's answer is kept a day (`patreon_memberships`, see
 * `patreon.ts`), and makes no credits.
 *
 * What a subscription gives access to is a **service**, such as the catalogue: services form a tree, and access to one gives access to every one under it (`subscription_services`, see `services.ts`). An offer adds time to the services it names
 * (`offer_services`), and a credit gives its time to those it names (`credit_services`).
 *
 * What `subscription_credits`, `credit_services` and `patreon_memberships` hold of a user is on the website's
 * "What we store" page (`/privacy`): change one, change both. Services, offers and settings hold nothing of anyone.
 */
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';

import { REFUND_REASONS } from '../../refund-reasons.js';
import { users } from '../accounts/schema.js';

const createdAt = timestamp({ withTimezone: true }).notNull().defaultNow();

/** Where a credit's time came from. */
export type { RefundReason } from '../../refund-reasons.js';

export const CREDIT_SOURCES = ['grant', 'patreon', 'payment', 'introductory'] as const;
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
  /** The payment providers that offer it, such as `stripe`: those it was put to when made. */
  providers: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** What each provider knows it by, such as its Stripe Product and Price. */
  providerRefs: jsonb().$type<OfferProviderRefs>().notNull().default({}),
  /** Offered only from and until these, if set. */
  availableFrom: timestamp({ withTimezone: true }),
  availableUntil: timestamp({ withTimezone: true }),
  /** When an admin retired it: it is offered no longer. */
  retiredAt: timestamp({ withTimezone: true }),
  /**
   * Whether it is an introductory offer: free, never sold through a payment provider, and claimed once a person, by an
   * account never subscribed, as the Terms and Conditions say (Sec. B.V.3).
   */
  introductory: boolean().notNull().default(false),
  /** The admin who made it. */
  createdBy: text().notNull(),
  createdAt,
});

/** How a dispute of a payment stands: being decided, won by the catalogue, or lost (charged back). */
export const DISPUTE_STATES = ['open', 'won', 'lost'] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];

/** What each payment provider knows an offer by. */
export interface OfferProviderRefs {
  readonly stripe?: { readonly product: string; readonly price: string };
}

/**
 * How a checkout stands: `open` while the buyer is at the provider's checkout; `processing` once they finished it
 * with a payment that confirms later; `paid` once its time is credited; `failed` or `expired` when nothing was charged.
 */
export const CHECKOUT_STATUSES = ['open', 'processing', 'paid', 'failed', 'expired'] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

/**
 * A purchase begun: who is buying which offer, at which provider's checkout, and when they asked for their time to
 * start at once and agreed to the terms of sale, as they must before they are sent to it. No amounts and no payment
 * details: the provider's checkout takes the payment, and its webhook says how it went.
 */
export const subscriptionCheckouts = pgTable(
  'subscription_checkouts',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    offerId: text()
      .notNull()
      .references(() => subscriptionOffers.id),
    /** The provider whose checkout it is, such as `stripe`. */
    provider: text().notNull(),
    /** The provider's own reference for the checkout, such as a Stripe Checkout Session's id, once it is made. */
    sessionId: text(),
    status: text({ enum: CHECKOUT_STATUSES }).notNull().default('open'),
    /** When the buyer asked for their time to start at once and agreed to the terms of sale. */
    consentedAt: timestamp({ withTimezone: true }).notNull(),
    /** The credit its payment made. */
    creditId: text().references(() => subscriptionCredits.id, { onDelete: 'set null' }),
    createdAt,
    /** When it last changed, as the provider said. */
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('subscription_checkouts_user_id').on(table.userId),
    uniqueIndex('subscription_checkouts_provider_session').on(table.provider, table.sessionId),
  ],
);

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
    /**
     * What was paid for it in all, tax included, in the minor unit of the currency it was paid in, as the provider
     * said; none for a grant or Patreon. Its invoice is the provider's.
     */
    amountPaid: integer(),
    currencyPaid: text(),
    /**
     * What has been refunded of its payment in all, in the same unit: the whole of it once charged back. The time it
     * paid for is taken back in proportion (see `store.ts`).
     */
    refundedAmount: integer().notNull().default(0),
    /** When a refund of it was last taken back. */
    refundedAt: timestamp({ withTimezone: true }),
    /** When its buyer asked, on their Subscription page, to cancel it and be refunded. */
    refundRequestedAt: timestamp({ withTimezone: true }),
    /** Why, as they chose: one of {@link REFUND_REASONS}; for `other`, in their own words too. */
    refundReason: text({ enum: REFUND_REASONS }),
    refundReasonText: text(),
    /** How a dispute of its payment with the buyer's bank stands, if there is one: `open`, `won` or `lost`. */
    disputed: text({ enum: DISPUTE_STATES }),
    /** When that dispute was opened, as Stripe first said so. */
    disputedAt: timestamp({ withTimezone: true }),
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

/** Why asking Patreon last failed: it could not be asked, it no longer takes the token, or the token may not read memberships. */
export const PATREON_FAILURES = ['unreachable', 'revoked', 'scope'] as const;
export type PatreonFailure = (typeof PATREON_FAILURES)[number];

/**
 * A user's membership of the catalogue's Patreon campaign, as Patreon last said, asked again once a day (see
 * `patreon.ts`). Whether it makes them subscribed is worked out when it is read, against the least amount the admins
 * set now.
 */
export const patreonMemberships = pgTable('patreon_memberships', {
  userId: text()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** `active_patron`, `declined_patron` or `former_patron`, as Patreon says; none for someone who is no member. */
  patronStatus: text(),
  /** What they pledge now, in the minor unit of the campaign's currency. */
  amount: integer(),
  /** When Patreon next charges them, if it says. */
  nextChargeAt: timestamp({ withTimezone: true }),
  /** When Patreon last answered; none if it never has. */
  checkedAt: timestamp({ withTimezone: true }),
  /** When it was last asked, answered or not. */
  askedAt: timestamp({ withTimezone: true }).notNull(),
  /** Why the last asking failed; none when Patreon answered. */
  failure: text({ enum: PATREON_FAILURES }),
});

/** What admins set for the whole catalogue, by name, such as the least Patreon pledge that subscribes. */
export const catalogueSettings = pgTable('catalogue_settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  /** The admin who set it last. */
  updatedBy: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * What a subscription gives access to: a service, such as the catalogue, in a tree. Access to one gives access to every one under it: time on `apps` gives `catalogue` and `aide` too. Never deleted once made, so that what was bought for one stays as it
 * was: one no longer offered is retired.
 */
export const subscriptionServices = pgTable(
  'subscription_services',
  {
    /** What the applications ask for it by, such as `catalogue`: never changed once made. */
    id: text().primaryKey(),
    /** What it is called, such as `Catalogue`. */
    name: text().notNull(),
    /** What it gives, as the admins describe it. */
    description: text(),
    /** The service it is under; none for one at the top. */
    parentId: text().references((): AnyPgColumn => subscriptionServices.id),
    /** The admin who made it, or `migration` for those the accounts began with. */
    createdBy: text().notNull(),
    createdAt,
    /** When an admin retired it: nothing more is offered for it. */
    retiredAt: timestamp({ withTimezone: true }),
  },
  table => [index('subscription_services_parent_id').on(table.parentId)],
);

/** The services an offer adds time to: one at least. */
export const offerServices = pgTable(
  'offer_services',
  {
    offerId: text()
      .notNull()
      .references(() => subscriptionOffers.id),
    serviceId: text()
      .notNull()
      .references(() => subscriptionServices.id),
  },
  table => [primaryKey({ columns: [table.offerId, table.serviceId] })],
);

/** The services a credit gives its time to: those of its offer, or those an admin granted. */
export const creditServices = pgTable(
  'credit_services',
  {
    creditId: text()
      .notNull()
      .references(() => subscriptionCredits.id, { onDelete: 'cascade' }),
    serviceId: text()
      .notNull()
      .references(() => subscriptionServices.id),
  },
  table => [
    primaryKey({ columns: [table.creditId, table.serviceId] }),
    index('credit_services_service_id').on(table.serviceId),
  ],
);
