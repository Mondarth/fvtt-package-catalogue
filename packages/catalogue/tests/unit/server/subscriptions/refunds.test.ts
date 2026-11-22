import { describe, expect, it } from 'vitest';

import { suggestedRefund } from '../../../../src/lib/server/subscriptions/refunds.js';

const NOW = new Date('2026-11-22T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);
const credit = (more: Partial<Parameters<typeof suggestedRefund>[0]> = {}) => ({
  startsAt: days(-10),
  months: 0,
  days: 30,
  amountPaid: 3000,
  refundedAmount: 0,
  ...more,
});

describe('the refund a purchase is owed', () => {
  it('is the share of what was paid that the days not yet used are, counted from its own start', () => {
    expect(suggestedRefund(credit(), NOW)).toEqual({ amount: 2000, days: 20, of: 30 });
  });

  it('is all of it for time that has not started, as time bought on to the end of a running subscription', () => {
    // Bought now, after six months still to run: none of it is used, within 14 days of buying or not.
    expect(suggestedRefund(credit({ startsAt: days(180) }), NOW)).toEqual({ amount: 3000, days: 30, of: 30 });
  });

  it('is nothing once its time has passed, and less what was refunded of it already', () => {
    expect(suggestedRefund(credit({ startsAt: days(-40) }), NOW)).toEqual({ amount: 0, days: 0, of: 30 });
    expect(suggestedRefund(credit({ refundedAmount: 500 }), NOW)).toMatchObject({ amount: 1500 });
    expect(suggestedRefund(credit({ refundedAmount: 2500 }), NOW)).toMatchObject({ amount: 0 });
  });

  it('is none for time not paid for, nothing for a period of no days, and taken now by default', () => {
    expect(suggestedRefund(credit({ amountPaid: null }), NOW)).toBeUndefined();
    expect(suggestedRefund(credit({ days: 0 }), NOW)).toEqual({ amount: 0, days: 0, of: 0 });
    expect(suggestedRefund(credit({ startsAt: new Date(Date.now() + 1000 * DAY) }))).toMatchObject({ days: 30 });
  });
});
