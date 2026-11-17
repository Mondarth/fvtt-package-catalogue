import { describe, expect, it } from 'vitest';

import { periodLabel } from '../../src/lib/period-label.js';

describe('periodLabel', () => {
  it('says months and days, each in the plural it takes', () => {
    expect(periodLabel({ months: 12, days: 0 }, 'en')).toBe('12 months');
    expect(periodLabel({ months: 1, days: 0 }, 'en')).toBe('1 month');
    expect(periodLabel({ months: 0, days: 1 }, 'en')).toBe('1 day');
    expect(periodLabel({ months: 1, days: 10 }, 'en')).toBe('1 month and 10 days');
  });

  it('is empty for no period, and reads the page’s locale by default', () => {
    expect(periodLabel({ months: 0, days: 0 })).toBe('');
    expect(periodLabel({ months: 2, days: 0 })).toBe('2 months');
  });
});
