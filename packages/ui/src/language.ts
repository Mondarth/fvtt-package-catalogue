/**
 * A language's name, in itself, with a capital as that language writes one: `English`, `Español`.
 *
 * @param locale - The language's code, such as `es`
 * @returns Its name
 */
export function languageName(locale: string): string {
  const name =
    new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ??
    /* istanbul ignore next -- `of` gives undefined only for a code the runtime does not know, which no application's is */
    locale;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}
