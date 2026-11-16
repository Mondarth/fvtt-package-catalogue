import { describe, expect, it } from 'vitest';

import { addPeriod, isPeriod, MAX_DAYS, MAX_MONTHS } from '../../../../src/lib/server/subscriptions/period.js';

const at = (iso: string) => new Date(iso);

describe('addPeriod', () => {
  it('adds calendar months, to the same day and time', () => {
    expect(addPeriod(at('2026-03-03T10:20:30.400Z'), { months: 12, days: 0 })).toEqual(at('2027-03-03T10:20:30.400Z'));
    expect(addPeriod(at('2026-11-16T00:00:00Z'), { months: 3, days: 0 })).toEqual(at('2027-02-16T00:00:00Z'));
  });

  it('ends a month that is shorter on its last day, never in the next', () => {
    expect(addPeriod(at('2026-01-31T12:00:00Z'), { months: 1, days: 0 })).toEqual(at('2026-02-28T12:00:00Z'));
    expect(addPeriod(at('2028-01-31T12:00:00Z'), { months: 1, days: 0 })).toEqual(at('2028-02-29T12:00:00Z'));
    expect(addPeriod(at('2026-08-31T00:00:00Z'), { months: 1, days: 0 })).toEqual(at('2026-09-30T00:00:00Z'));
  });

  it('adds days after the months', () => {
    expect(addPeriod(at('2026-01-31T00:00:00Z'), { months: 1, days: 1 })).toEqual(at('2026-03-01T00:00:00Z'));
    expect(addPeriod(at('2026-12-25T00:00:00Z'), { months: 0, days: 10 })).toEqual(at('2027-01-04T00:00:00Z'));
  });
});

describe('isPeriod', () => {
  it('is whole months and days, some, and not too many', () => {
    expect(isPeriod({ months: 12, days: 0 })).toBe(true);
    expect(isPeriod({ months: 0, days: 7 })).toBe(true);
    expect(isPeriod({ months: MAX_MONTHS, days: MAX_DAYS })).toBe(true);
  });

  it.each([
    [{ months: 0, days: 0 }],
    [{ months: -1, days: 5 }],
    [{ months: 1, days: -1 }],
    [{ months: 1.5, days: 0 }],
    [{ months: 0, days: Number.NaN }],
    [{ months: MAX_MONTHS + 1, days: 0 }],
    [{ months: 0, days: MAX_DAYS + 1 }],
  ])('is not %o', period => {
    expect(isPeriod(period)).toBe(false);
  });
});
