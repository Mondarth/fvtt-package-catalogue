/**
 * What the website knows of its locales beyond their messages.
 */
import { baseLocale, locales, type Locale } from './paraglide/runtime.js';

/**
 * The locales whose messages were translated by machine and have not been reviewed by a speaker of the language.
 * Pages in them say so. Remove a locale from here once its translation is reviewed.
 */
export const MACHINE_TRANSLATED: ReadonlySet<Locale> = new Set<Locale>(['es']);

/**
 * Whether a locale's messages were translated by machine.
 *
 * @param locale - The locale
 * @returns Whether pages in it need the machine translation notice
 */
export function isMachineTranslated(locale: Locale): boolean {
  return MACHINE_TRANSLATED.has(locale);
}

/**
 * A language's name in that language, such as "Español" for `es`, as a language picker shows it. It comes from the
 * runtime's own data, so it needs no message.
 *
 * @param locale - The locale
 * @returns Its name, capitalised as a heading of its own
 */
export function languageName(locale: Locale): string {
  /* v8 ignore start -- `of` gives undefined only for a code the runtime does not know, which no Locale is */
  const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
  /* v8 ignore stop */
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

export { baseLocale, locales, type Locale };
