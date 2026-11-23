import { describe, expect, it } from 'vitest';

import { formatPrice, minorDigits, parsePrices } from '../../src/lib/prices.js';

describe('parsePrices', () => {
  it('reads each line, in the minor unit of its currency', () => {
    expect(parsePrices('GBP 30.00\n  eur 35.5 \n\nJPY 4000\nUSD 38')).toEqual({
      ok: true,
      prices: { GBP: 3000, EUR: 3550, JPY: 4000, USD: 3800 },
    });
  });

  it.each([
    ['XYZ 1.00', 'XYZ 1.00'],
    ['GBP 1.005', 'GBP 1.005'],
    ['JPY 10.5', 'JPY 10.5'],
    ['GBP -1', 'GBP -1'],
    ['GBP', 'GBP'],
    ['GBP 1\ngbp 2', 'gbp 2'],
    ['', ''],
    ['\n  \n', ''],
  ])('refuses %j, naming %j', (text, line) => {
    expect(parsePrices(text)).toEqual({ ok: false, line });
  });
});

describe('minorDigits', () => {
  it('is the digits of each currency’s minor unit', () => {
    expect(minorDigits('GBP')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
  });
});

describe('formatPrice', () => {
  it('writes money as the reader does', () => {
    expect(formatPrice('GBP', 3000, 'en')).toBe('£30.00');
    expect(formatPrice('JPY', 4000, 'en')).toBe('¥4,000');
    expect(formatPrice('EUR', 3550, 'es')).toMatch(/35,50/);
  });
});
