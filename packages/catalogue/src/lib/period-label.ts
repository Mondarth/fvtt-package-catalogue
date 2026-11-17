/**
 * A subscription's period in words, as the reader says it: `12 months`, `1 month and 10 days`, `10 días`.
 */
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';

/**
 * A period in words.
 *
 * @param period - Its months and days
 * @param period.months - How many months
 * @param period.days - How many days
 * @param locale - The reader's locale; the page's by default
 * @returns The words
 */
export function periodLabel({ months, days }: { months: number; days: number }, locale = getLocale()): string {
  const plural = new Intl.PluralRules(locale);
  const parts = [
    ...(months > 0
      ? [(plural.select(months) === 'one' ? m.period_months_one : m.period_months_other)({ count: months })]
      : []),
    ...(days > 0 ? [(plural.select(days) === 'one' ? m.period_days_one : m.period_days_other)({ count: days })] : []),
  ];
  const [first = '', second] = parts;
  return second === undefined ? first : m.period_and({ first, second });
}
