/**
 * What a refund asked for should be: the share of what was paid that the time not yet used is of the purchase's time,
 * the days counted from when the purchase's own time starts, not from when it was bought, less what was refunded of it
 * already. Time bought on to the end of a running subscription has used none of itself until it starts, so cancelling
 * it before then refunds it all. Whether it is within 14 days of the purchase changes nothing here: the terms of sale
 * refund the time not yet used either way.
 */
import { creditDays } from './store.js';

import type { Credit } from './store.js';

/** A day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** A refund to make, and the days of the purchase's time it is for. */
export interface SuggestedRefund {
  /** In the minor unit of the currency it was paid in. */
  readonly amount: number;
  readonly days: number;
  /** All the purchase's days. */
  readonly of: number;
}

/**
 * The refund a purchase's buyer is owed now.
 *
 * @param credit - The purchase's credit, paid for
 * @param now - The time now
 * @returns The refund, or `undefined` for a credit not paid for
 */
export function suggestedRefund(
  credit: Pick<Credit, 'startsAt' | 'months' | 'days' | 'amountPaid' | 'refundedAmount'>,
  now: Date = new Date(),
): SuggestedRefund | undefined {
  if (credit.amountPaid === null) return undefined;
  const of = creditDays(credit);
  const from = Math.max(now.getTime(), credit.startsAt.getTime());
  const end = credit.startsAt.getTime() + of * DAY_MS;
  const days = Math.max(0, Math.min(of, Math.floor((end - from) / DAY_MS)));
  const owed = of === 0 ? 0 : Math.floor((credit.amountPaid * days) / of);
  return { amount: Math.max(0, owed - credit.refundedAmount), days, of };
}

/** The days after a purchase within which cancelling it refunds it at once, with no admin to make it (Terms B.II.1). */
export const CANCELLATION_DAYS = 14;

/**
 * Whether a purchase is still within the days after it was bought that cancelling it refunds it at once. The days run
 * from when it was bought, not from when its time starts.
 *
 * @param credit - The purchase's credit
 * @param now - The time now
 * @returns `true` within them
 */
export function withinCancellation(credit: Pick<Credit, 'createdAt'>, now: Date = new Date()): boolean {
  return now.getTime() - credit.createdAt.getTime() <= CANCELLATION_DAYS * DAY_MS;
}
