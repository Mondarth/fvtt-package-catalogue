/**
 * The website's languages: English, the one it is written in, and those translated from it, by machine, as each page
 * in them says.
 */
import { baseLocale, locales, type Locale } from './paraglide/runtime.js';

/** The locales whose messages were translated by machine. */
export const MACHINE_TRANSLATED: ReadonlySet<Locale> = new Set<Locale>(['es']);

/**
 * Whether a locale's messages were translated by machine.
 *
 * @param locale - The locale
 * @returns Whether they were
 */
export function isMachineTranslated(locale: Locale): boolean {
  return MACHINE_TRANSLATED.has(locale);
}

export { languageName } from '@mondarth/ui/language';
export { baseLocale, locales, type Locale };
