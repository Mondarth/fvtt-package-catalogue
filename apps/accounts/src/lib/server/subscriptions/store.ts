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

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, max, or, sql } from 'drizzle-orm';

import { users } from '../accounts/schema.js';
import { isUniqueViolation } from '../db/errors.js';
import { addEligibility, listEligibilities } from './eligibilities.js';
import { addPeriod } from './period.js';
import { subscriptionCheckouts, subscriptionCredits, subscriptionOffers } from './schema.js';

import type { Database } from '../db/database.js';
import type { Eligibility, EligibilityInput } from './eligibilities.js';
import type { Period } from './period.js';
import type { CheckoutStatus, CreditSource, DisputeState, OfferProviderRefs, RefundReason } from './schema.js';

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
  /** Whether it is an introductory offer: free, claimed once a person by an account never subscribed. */
  readonly introductory?: boolean | undefined;
}

/** A refund, or a dispute lost, to take back the time it paid for. */
export interface TakeBack {
  readonly creditId: string;
  /** What has been refunded of its payment in all, now; the whole of it for a dispute lost. */
  readonly refunded: number;
  /** What was paid, in the same unit. */
  readonly amount: number;
  /** How a dispute of it now stands, for one lost. */
  readonly disputed?: DisputeState | undefined;
}

/** What taking time back did: how many days, and the subscription's end before and after. */
export interface TakenBack {
  readonly days: number;
  readonly before: Date;
  readonly after: Date;
}

/** Why a buyer asked for a refund, where they said: a reason they chose, and, for `other`, their own words. */
export interface GivenReason {
  readonly reason: RefundReason;
  readonly text?: string | undefined;
}

/** A credit an admin is to act on, such as a refund asked for or a dispute open, with its buyer. */
export interface RefundRequest {
  readonly credit: Credit;
  readonly handle: string;
}

/** What changing a subscription's end did. */
export interface Changed {
  readonly before: Date | null;
  readonly after: Date | null;
}

/** What the website asks of subscriptions. */
export interface SubscriptionStore {
  /** Every eligibility, with how many offers on sale add time to each (see `eligibilities.ts`). */
  eligibilities(): Promise<Eligibility[]>;
  /** Adds an eligibility, under another or at the top. */
  addEligibility(input: EligibilityInput): Promise<Eligibility | 'taken' | 'no-parent'>;
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
  /**
   * Takes back the time a refund, or a dispute lost, paid for: its share of the credit's days, as much as has been
   * refunded of its payment in all, rounded down to whole days, and all of them once all of it has; less what earlier
   * refunds took. The days come off the end of the subscription, wherever the credit falls in it, used or not.
   *
   * @returns What it took, `duplicate` for nothing more refunded than already taken back, or `undefined` for no such
   *   credit
   */
  takeBack(input: TakeBack, now?: Date): Promise<TakenBack | 'duplicate' | undefined>;
  /** Records how a dispute of a credit's payment stands, and, as it is opened, when. */
  setDisputed(creditId: string, state: DisputeState, now?: Date): Promise<void>;
  /**
   * Records that a credit's buyer asked to cancel it and be refunded, once: asking again changes nothing.
   *
   * @returns The credit, or `undefined` for none of theirs that was paid for and is not refunded in full
   */
  requestRefund(userId: string, creditId: string, reason?: GivenReason, now?: Date): Promise<Credit | undefined>;
  /** The refunds asked for since each credit was last refunded, oldest first, with their buyers. */
  refundRequests(): Promise<RefundRequest[]>;
  /** The payments disputed whose disputes are still being decided, the longest open first, with their buyers. */
  openDisputes(): Promise<RefundRequest[]>;
  /** A credit, by its id. */
  creditById(id: string): Promise<Credit | undefined>;
  /** The checkout that made a credit, if one did. */
  checkoutOfCredit(creditId: string): Promise<Checkout | undefined>;
}

/** A day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many days a credit's period runs from its start: its share of them, rounded down, is what a partial refund takes
 * back.
 *
 * @param credit - The credit
 * @returns Its days
 */
export function creditDays(credit: Pick<Credit, 'startsAt' | 'months' | 'days'>): number {
  return Math.round((addPeriod(credit.startsAt, credit).getTime() - credit.startsAt.getTime()) / DAY_MS);
}

/**
 * The days of a credit that so much refunded of its payment pays for: its share, rounded down, or all of them once
 * all of it is refunded.
 */
const shareOf = (days: number, refunded: number, amount: number) =>
  refunded >= amount ? days : Math.floor((days * Math.max(0, refunded)) / amount);

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
    eligibilities: () => listEligibilities(db),
    addEligibility: input => addEligibility(db, input),
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
            .set({
              startsAt: sql`least(${subscriptionCredits.startsAt}, ${end.toISOString()}::timestamptz)`,
              endsAt: end,
            })
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

    async takeBack(input, now = new Date()) {
      return db.transaction(async tx => {
        const [credit] = await tx
          .select()
          .from(subscriptionCredits)
          .where(eq(subscriptionCredits.id, input.creditId))
          .for('update');
        if (credit === undefined) return undefined;
        await hold(tx, credit.userId);
        if (input.refunded <= credit.refundedAmount) {
          if (input.disputed !== undefined && input.disputed !== credit.disputed) {
            await tx
              .update(subscriptionCredits)
              .set({ disputed: input.disputed })
              .where(eq(subscriptionCredits.id, credit.id));
          }
          return 'duplicate';
        }
        const all = creditDays(credit);
        const days = shareOf(all, input.refunded, input.amount) - shareOf(all, credit.refundedAmount, input.amount);
        const before = await paidUntil(tx, credit.userId);
        // The credit is the user's, so their subscription ends when the latest of theirs does.
        /* v8 ignore next */
        if (before === null) throw new Error(`The credit ${credit.id} makes no subscription`);
        if (days > 0) {
          // Off the end, wherever the credit falls: each credit that runs past the new end now ends there.
          const end = new Date(before.getTime() - days * DAY_MS);
          await tx
            .update(subscriptionCredits)
            .set({
              startsAt: sql`least(${subscriptionCredits.startsAt}, ${end.toISOString()}::timestamptz)`,
              endsAt: end,
            })
            .where(and(eq(subscriptionCredits.userId, credit.userId), gt(subscriptionCredits.endsAt, end)));
        }
        await tx
          .update(subscriptionCredits)
          .set({
            refundedAmount: Math.min(input.refunded, input.amount),
            refundedAt: now,
            ...(input.disputed !== undefined && { disputed: input.disputed }),
          })
          .where(eq(subscriptionCredits.id, credit.id));
        const after = await paidUntil(tx, credit.userId);
        // As before: taking days back leaves every credit in place, ending earlier.
        /* v8 ignore next */
        if (after === null) throw new Error(`The credit ${credit.id} makes no subscription`);
        return { days, before, after };
      });
    },

    async setDisputed(creditId, state, now = new Date()) {
      await db
        .update(subscriptionCredits)
        .set({
          disputed: state,
          // When it was opened: kept as it is decided, and set afresh only for a dispute opened after another closed.
          ...(state === 'open' && {
            disputedAt: sql`case when ${subscriptionCredits.disputed} = 'open' then ${subscriptionCredits.disputedAt} else ${now.toISOString()}::timestamptz end`,
          }),
        })
        .where(eq(subscriptionCredits.id, creditId));
    },

    async creditById(id) {
      const [found] = await db.select().from(subscriptionCredits).where(eq(subscriptionCredits.id, id));
      return found;
    },

    async checkoutOfCredit(creditId) {
      const [found] = await db.select().from(subscriptionCheckouts).where(eq(subscriptionCheckouts.creditId, creditId));
      return found;
    },

    openDisputes: () =>
      db
        .select({ credit: subscriptionCredits, handle: users.handle })
        .from(subscriptionCredits)
        .innerJoin(users, eq(users.id, subscriptionCredits.userId))
        .where(eq(subscriptionCredits.disputed, 'open'))
        .orderBy(asc(subscriptionCredits.disputedAt)),

    async requestRefund(userId, creditId, reason, now = new Date()) {
      const [credit] = await db
        .select()
        .from(subscriptionCredits)
        .where(and(eq(subscriptionCredits.id, creditId), eq(subscriptionCredits.userId, userId)));
      if (credit?.source !== 'payment' || credit.amountPaid === null || credit.refundedAmount >= credit.amountPaid) {
        return undefined;
      }
      if (
        credit.refundRequestedAt !== null &&
        (credit.refundedAt === null || credit.refundedAt < credit.refundRequestedAt)
      ) {
        return credit;
      }
      const [asked] = await db
        .update(subscriptionCredits)
        .set({
          refundRequestedAt: now,
          refundReason: reason?.reason ?? null,
          refundReasonText: reason?.reason === 'other' ? (reason.text ?? null) : null,
        })
        .where(eq(subscriptionCredits.id, creditId))
        .returning();
      return asked;
    },

    async refundRequests() {
      const found = await db
        .select({ credit: subscriptionCredits, handle: users.handle })
        .from(subscriptionCredits)
        .innerJoin(users, eq(users.id, subscriptionCredits.userId))
        .where(
          and(
            isNotNull(subscriptionCredits.refundRequestedAt),
            or(
              isNull(subscriptionCredits.refundedAt),
              lt(subscriptionCredits.refundedAt, subscriptionCredits.refundRequestedAt),
            ),
          ),
        )
        .orderBy(asc(subscriptionCredits.refundRequestedAt));
      return found;
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
          introductory: input.introductory ?? false,
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
