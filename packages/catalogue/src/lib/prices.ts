/**
 * Offers' prices: in each currency's minor unit, such as pence, as an offer keeps them (`{ "GBP": 3000 }` for
 * £30.00), entered one a line as `GBP 30.00`, and shown in the reader's own way of writing money.
 */

/** Prices, by currency code, in each currency's minor unit. */
export type Prices = Readonly<Record<string, number>>;

/**
 * How many digits a currency's minor unit has, as `Intl` knows it: 2 for GBP, 0 for JPY.
 *
 * @param currency - Its ISO 4217 code
 * @returns The digits
 */
export function minorDigits(currency: string): number {
  const { maximumFractionDigits } = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions();
  // A currency's format always has its digits.
  /* v8 ignore next */
  return maximumFractionDigits ?? 2;
}

/** The currencies `Intl` knows. */
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

/** What reading prices gave: the prices, or the line that is not one. */
export type ParsedPrices =
  { readonly ok: true; readonly prices: Prices } | { readonly ok: false; readonly line: string };

/**
 * Reads prices entered one a line, each a currency's code and an amount, such as `GBP 30.00`; blank lines are
 * skipped. A currency `Intl` does not know, an amount with more decimals than the currency has, a negative or a second
 * price in one currency is not read, nor is no price at all.
 *
 * @param text - The lines
 * @returns The prices, or the first line that is not one
 */
export function parsePrices(text: string): ParsedPrices {
  const prices: Record<string, number> = {};
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '');
  for (const line of lines) {
    const match = /^([A-Za-z]{3})\s+(\d+)(?:\.(\d+))?$/.exec(line);
    const currency = match?.[1]?.toUpperCase();
    if (match === null || currency === undefined || !CURRENCIES.has(currency) || currency in prices) {
      return { ok: false, line };
    }
    const digits = minorDigits(currency);
    const fraction = match[3] ?? '';
    if (fraction.length > digits) return { ok: false, line };
    // The pattern always has the whole part.
    /* v8 ignore next */
    const whole = match[2] ?? '0';
    prices[currency] = Number(`${whole}${fraction.padEnd(digits, '0')}`);
  }
  return lines.length === 0 ? { ok: false, line: '' } : { ok: true, prices };
}

/**
 * A price, as the reader writes money.
 *
 * @param currency - Its currency's code
 * @param minor - The amount, in the currency's minor unit
 * @param locale - The reader's locale
 * @returns It, such as `£30.00`
 */
export const formatPrice = (currency: string, minor: number, locale: string): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 10 ** minorDigits(currency));
