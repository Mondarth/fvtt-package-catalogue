/**
 * Dates and times, as each reader writes them (see `@mondarth/ui/dates`), the page's language, where no layout set the
 * reader's locale, being the accounts' own.
 */
import { useDates as shared } from '@mondarth/ui/dates';

import { getLocale } from '#lib/paraglide/runtime.js';

import type { Dates } from '@mondarth/ui/dates';

export { datesIn, dateLocaleOf, setDateLocale, type Dates } from '@mondarth/ui/dates';

/**
 * Writing dates and times as the reader does: in the locale the root layout set, or the page's language.
 *
 * @returns How
 */
export function useDates(): Dates {
  return shared(getLocale);
}
