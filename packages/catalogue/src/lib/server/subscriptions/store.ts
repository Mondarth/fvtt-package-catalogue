/**
 * Subscriptions: whether a user is subscribed, until when, and the credits and offers that make it so.
 *
 * A user is subscribed until the latest of their credits ends. Time bought or granted is fixed when it is: it starts
 * at the later of now and when the subscription would end, and runs for its period in calendar months and days, so a
 * price changed meanwhile changes nothing already bought. A payment is credited once, however often its provider says
 * so, by its provider and reference.
 *
 * Each change to a user's credits is made in a transaction that holds their profile, so that two at once cannot both
 * start from the same end.
 */
import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, gt, inArray, isNull, lte, max, or, sql } from 'drizzle-orm';

import { users } from '../accounts/schema.js';
import { isUniqueViolation } from '../db/errors.js';
import { addPeriod } from './period.js';
import { subscriptionCheckouts, subscriptionCredits, subscriptionOffers } from './schema.js';

import type { Database } from '../db/database.js';
import type { Period } from './period.js';
import type { CheckoutStatus, CreditSource, OfferProviderRefs } from './schema.js';

/** Whether a user is subscribed, and until when. */
export interface SubscriptionStatus {
  /** When the latest credit ends; none if there has never been one. */
  readonly paidUntil: Date | null;
  readonly active: boolean;
}

/** A credit, as it is read back. */
export type Credit = typeof subscriptionCredits.$inferSelect;

/** An offer, as it is read back. */
export type Offer = typeof subscriptionOffers.$inferSelect;

/** A purchase begun, as it is read back. */
export type Checkout = typeof subscriptionCheckouts.$inferSelect;

/** A purchase to begin: who buys which offer, through which provider, and when they consented. */
export interface CheckoutInput {
  readonly userId: string;
  readonly offerId: string;
  readonly provider: string;
  readonly consentedAt: Date;
}

/** Time credited for a payment or a pledge, or granted. */
export interface CreditInput extends Period {
  readonly userId: string;
  readonly source: CreditSource;
  readonly provider?: string | null | undefined;
  readonly method?: string | null | undefined;
  readonly externalRef?: string | null | undefined;
  readonly providerAccount?: string | null | undefined;
  readonly offerId?: string | null | undefined;
  /** What was paid in all, tax included, in the minor unit of `currencyPaid`. */
  readonly amountPaid?: number | null | undefined;
  readonly currencyPaid?: string | null | undefined;
  readonly grantedBy?: string | null | undefined;
  readonly note?: string | null | undefined;
}

/** A new offer. */
export interface OfferInput extends Period {
  /** Its id, where it was put to a provider first; a new one otherwise. */
  readonly id?: string | undefined;
  readonly name: string;
  readonly prices: Readonly<Record<string, number>>;
  readonly availableFrom?: Date | null | undefined;
  readonly availableUntil?: Date | null | undefined;
  readonly createdBy: string;
  /** The payment providers it is put to, and what each knows it by. */
  readonly providers?: readonly string[] | undefined;
  readonly providerRefs?: OfferProviderRefs | undefined;
}

/** What changing a subscription's end did. */
export interface Changed {
  readonly before: Date | null;
  readonly after: Date | null;
}

/** What the website asks of subscriptions. */
export interface SubscriptionStore {
  status(userId: string, now?: Date): Promise<SubscriptionStatus>;
  /** A user's credits, the latest first. */
  history(userId: string): Promise<Credit[]>;
  /**
   * Credits time: from the later of now and when the subscription ends, for its period.
   *
   * @returns The credit, or `duplicate` for a payment credited already
   */
  credit(input: CreditInput, now?: Date): Promise<Credit | 'duplicate'>;
  /**
   * Sets when a user's subscription ends: a later end adds a granted credit to reach it; an earlier one cuts every
   * credit back to it, now among them, which ends it.
   */
  setEnd(userId: string, end: Date, by: string, note: string | null, now?: Date): Promise<Changed>;
  /** Every offer, the newest first, retired ones too. */
  offers(): Promise<Offer[]>;
  /** The offers on sale now. */
  activeOffers(now?: Date): Promise<Offer[]>;
  /** An offer, retired or not. */
  offer(id: string): Promise<Offer | undefined>;
  createOffer(input: OfferInput): Promise<Offer>;
  /** Retires an offer: it is offered no longer. Does nothing to one retired already. */
  retireOffer(id: string, now?: Date): Promise<Offer | undefined>;
  /** The credit a provider's payment made, by the provider's reference for it. */
  creditOf(provider: string, externalRef: string): Promise<Credit | undefined>;
  /** Begins a purchase, before the buyer is sent to the provider's checkout. */
  openCheckout(input: CheckoutInput): Promise<Checkout>;
  /** Records the provider's reference for a purchase's checkout, once it is made. */
  attachSession(id: string, sessionId: string): Promise<void>;
  /** A purchase, by the catalogue's id for it, or else by the provider's for its checkout. */
  checkoutOf(provider: string, id: string | undefined, sessionId: string): Promise<Checkout | undefined>;
  /**
   * Records how a purchase now stands. A paid one, or one closed without payment, is not changed again: an event
   * Stripe sends late, or twice, cannot undo it.
   */
  settleCheckout(id: string, status: CheckoutStatus, creditId?: string, now?: Date): Promise<void>;
  /** A user's purchases still being paid for: finished at the checkout with a payment that confirms later. */
  processingCheckouts(userId: string): Promise<Checkout[]>;
}

/** How a purchase may stand before it changes: one paid, failed or expired is settled for good. */
const UNSETTLED: readonly CheckoutStatus[] = ['open', 'processing'];

/**
 * The store, over the database.
 *
 * @param db - The database
 * @returns The store
 */
export function subscriptionStore(db: Database): SubscriptionStore {
  /** When a user's latest credit ends, in a transaction or not. */
  async function paidUntil(on: Pick<Database, 'select'>, userId: string): Promise<Date | null> {
    const [found] = await on
      .select({ end: max(subscriptionCredits.endsAt) })
      .from(subscriptionCredits)
      .where(eq(subscriptionCredits.userId, userId));
    return found?.end ?? null;
  }

  /** Holds a user's profile until the transaction ends, so that changes to their credits come one after another. */
  const hold = (tx: Pick<Database, 'select'>, userId: string) =>
    tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');

  return {
    async status(userId, now = new Date()) {
      const end = await paidUntil(db, userId);
      return { paidUntil: end, active: end !== null && end > now };
    },

    history: userId =>
      db
        .select()
        .from(subscriptionCredits)
        .where(eq(subscriptionCredits.userId, userId))
        .orderBy(desc(subscriptionCredits.startsAt), desc(subscriptionCredits.createdAt)),

    async credit(input, now = new Date()) {
      try {
        return await db.transaction(async tx => {
          await hold(tx, input.userId);
          const end = await paidUntil(tx, input.userId);
          const startsAt = end !== null && end > now ? end : now;
          const [made] = await tx
            .insert(subscriptionCredits)
            .values({
              id: randomUUID(),
              userId: input.userId,
              source: input.source,
              provider: input.provider ?? null,
              method: input.method ?? null,
              externalRef: input.externalRef ?? null,
              providerAccount: input.providerAccount ?? null,
              offerId: input.offerId ?? null,
              amountPaid: input.amountPaid ?? null,
              currencyPaid: input.currencyPaid ?? null,
              months: input.months,
              days: input.days,
              startsAt,
              endsAt: addPeriod(startsAt, input),
              grantedBy: input.grantedBy ?? null,
              note: input.note ?? null,
            })
            .returning();
          // An insert returns what it made.
          /* v8 ignore next */
          if (made === undefined) throw new Error('The credit was not made');
          return made;
        });
      } catch (error) {
        if (isUniqueViolation(error)) return 'duplicate';
        throw error;
      }
    },

    async setEnd(userId, end, by, note, now = new Date()) {
      return db.transaction(async tx => {
        await hold(tx, userId);
        const before = await paidUntil(tx, userId);
        const from = before !== null && before > now ? before : now;
        if (end > from) {
          await tx.insert(subscriptionCredits).values({
            id: randomUUID(),
            userId,
            source: 'grant',
            startsAt: from,
            endsAt: end,
            grantedBy: by,
            note,
          });
        } else {
          // Each credit that runs past the end now ends there; one that starts after it is left as nothing, at the end.
          // Who granted or paid for it is kept; the audit log records who changed its end.
          await tx
            .update(subscriptionCredits)
            .set({ startsAt: sql`least(${subscriptionCredits.startsAt}, ${end})`, endsAt: end })
            .where(and(eq(subscriptionCredits.userId, userId), gt(subscriptionCredits.endsAt, end)));
        }
        return { before, after: await paidUntil(tx, userId) };
      });
    },

    offers: () => db.select().from(subscriptionOffers).orderBy(desc(subscriptionOffers.createdAt)),

    async offer(id) {
      const [found] = await db.select().from(subscriptionOffers).where(eq(subscriptionOffers.id, id));
      return found;
    },

    async creditOf(provider, externalRef) {
      const [found] = await db
        .select()
        .from(subscriptionCredits)
        .where(and(eq(subscriptionCredits.provider, provider), eq(subscriptionCredits.externalRef, externalRef)));
      return found;
    },

    async openCheckout(input) {
      const [made] = await db
        .insert(subscriptionCheckouts)
        .values({ id: randomUUID(), ...input })
        .returning();
      // An insert returns what it made.
      /* v8 ignore next */
      if (made === undefined) throw new Error('The checkout was not made');
      return made;
    },

    async attachSession(id, sessionId) {
      await db.update(subscriptionCheckouts).set({ sessionId }).where(eq(subscriptionCheckouts.id, id));
    },

    async checkoutOf(provider, id, sessionId) {
      const [found] = await db
        .select()
        .from(subscriptionCheckouts)
        .where(
          and(
            eq(subscriptionCheckouts.provider, provider),
            id === undefined
              ? eq(subscriptionCheckouts.sessionId, sessionId)
              : or(eq(subscriptionCheckouts.id, id), eq(subscriptionCheckouts.sessionId, sessionId)),
          ),
        );
      return found;
    },

    async settleCheckout(id, status, creditId, now = new Date()) {
      await db
        .update(subscriptionCheckouts)
        .set({ status, updatedAt: now, ...(creditId !== undefined && { creditId }) })
        .where(and(eq(subscriptionCheckouts.id, id), inArray(subscriptionCheckouts.status, [...UNSETTLED])));
    },

    processingCheckouts: userId =>
      db
        .select()
        .from(subscriptionCheckouts)
        .where(and(eq(subscriptionCheckouts.userId, userId), eq(subscriptionCheckouts.status, 'processing')))
        .orderBy(desc(subscriptionCheckouts.createdAt)),

    activeOffers: (now = new Date()) =>
      db
        .select()
        .from(subscriptionOffers)
        .where(
          and(
            isNull(subscriptionOffers.retiredAt),
            or(isNull(subscriptionOffers.availableFrom), lte(subscriptionOffers.availableFrom, now)),
            or(isNull(subscriptionOffers.availableUntil), gt(subscriptionOffers.availableUntil, now)),
          ),
        )
        .orderBy(asc(subscriptionOffers.months), asc(subscriptionOffers.days)),

    async createOffer(input) {
      const [made] = await db
        .insert(subscriptionOffers)
        .values({
          id: input.id ?? randomUUID(),
          name: input.name,
          months: input.months,
          days: input.days,
          prices: { ...input.prices },
          availableFrom: input.availableFrom ?? null,
          availableUntil: input.availableUntil ?? null,
          createdBy: input.createdBy,
          providers: [...(input.providers ?? [])],
          providerRefs: input.providerRefs ?? {},
        })
        .returning();
      // An insert returns what it made.
      /* v8 ignore next */
      if (made === undefined) throw new Error('The offer was not made');
      return made;
    },

    async retireOffer(id, now = new Date()) {
      const [retired] = await db
        .update(subscriptionOffers)
        .set({ retiredAt: now })
        .where(and(eq(subscriptionOffers.id, id), isNull(subscriptionOffers.retiredAt)))
        .returning();
      return retired;
    },
  };
}
