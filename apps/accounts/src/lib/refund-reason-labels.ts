/** Each reason a buyer can give for a refund (`refund-reasons.ts`), as the pages label it, in the reader's language. */
import { m } from '#lib/paraglide/messages.js';

import type { RefundReason } from './refund-reasons.js';

export const REFUND_REASON_LABELS: Readonly<Record<RefundReason, () => string>> = {
  'not-needed': m.subscription_refund_reason_not_needed,
  'too-expensive': m.subscription_refund_reason_too_expensive,
  other: m.subscription_refund_reason_other,
};
