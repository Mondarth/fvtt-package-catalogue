/**
 * The sign-in providers' names, as the website shows them. Not translated: they are the providers' own names.
 */
export const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  github: 'GitHub',
  test: 'Test provider',
};

/**
 * A provider's name.
 *
 * @param id - Its id, such as `github`
 * @returns Its name, or its id for one the website does not know
 */
export function providerName(id: string): string {
  return PROVIDER_NAMES[id] ?? id;
}
