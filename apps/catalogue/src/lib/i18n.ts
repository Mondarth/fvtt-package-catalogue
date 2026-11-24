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

export { languageName } from '@mondarth/ui/language';
export { baseLocale, locales, type Locale };
