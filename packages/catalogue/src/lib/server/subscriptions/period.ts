/**
 * A subscription's period: so many calendar months and days, as an offer sells it or an admin grants it. Months are
 * calendar months, so that twelve from 3 March end on 3 March next year; a month that is shorter ends on its last day,
 * so that one from 31 January ends on 28 or 29 February, never in March. Worked in UTC.
 */
import { MAX_DAYS, MAX_MONTHS } from '../../subscription-limits.js';

/** The longest period one grant or offer may give: ten years. */
export { MAX_DAYS, MAX_MONTHS };

/** So many calendar months and days. */
export interface Period {
  readonly months: number;
  readonly days: number;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether a period is one that may be given: whole months and days, neither negative nor too many, and not nothing.
 *
 * @param period - The period
 * @returns `true` if it is
 */
export function isPeriod(period: Period): boolean {
  const { months, days } = period;
  return (
    Number.isInteger(months) &&
    Number.isInteger(days) &&
    months >= 0 &&
    days >= 0 &&
    months <= MAX_MONTHS &&
    days <= MAX_DAYS &&
    months + days > 0
  );
}

/**
 * A time, a period on.
 *
 * @param from - The time
 * @param period - The period
 * @returns The time the period ends
 */
export function addPeriod(from: Date, { months, days }: Period): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  // The day of the month, or the last day of a shorter month: day 0 of the month after is its last.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const moved = new Date(
    Date.UTC(
      year,
      month,
      Math.min(from.getUTCDate(), lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
  return new Date(moved.getTime() + days * DAY);
}
