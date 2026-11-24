/**
 * Dates and times, as each reader writes them: in the regional form of the page's language their browser prefers,
 * such as `en-GB` (22/11/2026) or `en-US` (11/22/2026) on the English pages, from its `Accept-Language`. The server
 * works it out once a request (`dateLocaleOf`, in the root layout), and every page and component formats with it
 * (`useDates`), so that the server and the browser write a date alike.
 */
import { getContext, setContext } from 'svelte';

const KEY = Symbol('date-locale');

/**
 * The locale to write dates in: the first of the reader's languages, by their browser's `Accept-Language`, that is a
 * regional form of the page's own language, as `en-GB` of `en`; or else the page's language itself.
 *
 * @param acceptLanguage - The request's `Accept-Language` header, if any
 * @param language - The page's language, such as `en`
 * @returns The locale
 */
export function dateLocaleOf(acceptLanguage: string | null, language: string): string {
  const tags = (acceptLanguage ?? '')
    .split(',')
    .map(part => part.replace(/;.*/, '').trim())
    .filter(tag => tag.includes('-'));
  for (const tag of tags) {
    const [primary] = tag.split('-');
    if (primary?.toLowerCase() !== language.toLowerCase()) continue;
    try {
      const [supported] = Intl.DateTimeFormat.supportedLocalesOf(tag);
      if (supported !== undefined) return supported;
    } catch {
      // A tag that is no locale at all, as `en-!!`: the next one.
    }
  }
  return language;
}

/** Writing dates and times. */
export interface Dates {
  /** A day, such as 22/11/2026. */
  readonly date: (when: Date) => string;
  /** A day and time, such as 22/11/2026, 09:00:00. */
  readonly dateTime: (when: Date) => string;
}

/**
 * Writing dates and times in a locale.
 *
 * @param locale - The locale
 * @returns How
 */
export function datesIn(locale: string): Dates {
  return {
    date: when => when.toLocaleDateString(locale),
    dateTime: when => when.toLocaleString(locale),
  };
}

/**
 * Sets the locale every page and component under the caller writes dates in: the root layout's, from the server.
 *
 * @param locale - The locale, as it is now: asked each time a date is written
 */
export function setDateLocale(locale: () => string): void {
  setContext(KEY, locale);
}

/**
 * Writing dates and times as the reader does: in the locale the root layout set, or the page's language where none
 * is, as in a component shown alone.
 *
 * @param language - The page's language, as it is now
 * @returns How
 */
export function useDates(language: () => string): Dates {
  const locale = getContext<(() => string) | undefined>(KEY) ?? language;
  return {
    date: when => datesIn(locale()).date(when),
    dateTime: when => datesIn(locale()).dateTime(when),
  };
}
