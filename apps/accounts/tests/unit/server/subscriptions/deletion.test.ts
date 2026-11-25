import { describe, expect, it } from 'vitest';

import { deletionBlockOf } from '../../../../src/lib/server/subscriptions/deletion.js';

const at = (iso: string) => new Date(iso);
const credit = (more: Partial<Parameters<typeof deletionBlockOf>[0][number]> = {}) => ({
  disputed: null,
  refundRequestedAt: null,
  refundedAt: null,
  ...more,
});

describe('deleting a profile', () => {
  it('is allowed with no refund to make, and no dispute open', () => {
    expect(deletionBlockOf([])).toBeNull();
    expect(deletionBlockOf([credit(), credit({ disputed: 'won' }), credit({ disputed: 'lost' })])).toBeNull();
    // A refund asked for, and made since.
    const made = credit({ refundRequestedAt: at('2026-11-20T00:00:00Z'), refundedAt: at('2026-11-21T00:00:00Z') });
    expect(deletionBlockOf([made])).toBeNull();
  });

  it('waits for a refund asked for, and not made since, as one made before it was asked for is not it', () => {
    expect(deletionBlockOf([credit({ refundRequestedAt: at('2026-11-20T00:00:00Z') })])).toBe('refund');
    const earlier = credit({ refundRequestedAt: at('2026-11-22T00:00:00Z'), refundedAt: at('2026-11-21T00:00:00Z') });
    expect(deletionBlockOf([earlier])).toBe('refund');
  });

  it('waits for a dispute to be decided, before anything else', () => {
    expect(
      deletionBlockOf([credit({ refundRequestedAt: at('2026-11-20T00:00:00Z') }), credit({ disputed: 'open' })]),
    ).toBe('dispute');
  });
});
