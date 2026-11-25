/**
 * Whether a user may delete their profile now: not while a refund they asked for is still to be made, nor while a
 * payment of theirs is disputed with their bank, as the Terms and Conditions say (Sec. B.III.4), as deleting would
 * leave no account to refund, or to answer the dispute for.
 */
import type { Credit } from './store.js';

/** Why a profile may not be deleted now, if it may not: an open dispute first, as the graver. */
export type DeletionBlock = 'dispute' | 'refund';

/**
 * Why a user may not delete their profile now, by their credits.
 *
 * @param credits - The user's credits
 * @returns Why not, or null if they may
 */
export function deletionBlockOf(
  credits: readonly Pick<Credit, 'disputed' | 'refundRequestedAt' | 'refundedAt'>[],
): DeletionBlock | null {
  if (credits.some(credit => credit.disputed === 'open')) return 'dispute';
  // A refund asked for, and not made since it was asked for, as the admins' "Refunds asked for" counts it.
  const waiting = credits.some(
    ({ refundRequestedAt: asked, refundedAt: made }) => asked !== null && (made === null || made < asked),
  );
  return waiting ? 'refund' : null;
}
