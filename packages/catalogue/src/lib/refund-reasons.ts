/**
 * Why a buyer asks for a refund an admin is to make: the reasons they choose between on their Subscription page, each
 * kept by its code, and `other`, in their own words too. The pages label them (`refund-reason-labels.ts`); the database
 * schema takes the codes alone, so that the worker, which shares it, takes no messages.
 */

export const REFUND_REASONS = ['not-needed', 'too-expensive', 'other'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** The longest a buyer's own words for a refund may be. */
export const REFUND_REASON_MAX = 500;
