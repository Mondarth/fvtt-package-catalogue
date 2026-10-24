import { describe, expect, it } from 'vitest';

import { MACHINE_TRANSLATED, baseLocale, isMachineTranslated, languageName, locales } from '../../../src/lib/i18n.js';

describe('the locales', () => {
  it('are English and Spanish, English first', () => {
    expect(baseLocale).toBe('en');
    expect(locales).toEqual(['en', 'es']);
  });

  it('mark Spanish, and only Spanish, as machine translated', () => {
    expect([...MACHINE_TRANSLATED]).toEqual(['es']);
    expect(isMachineTranslated('es')).toBe(true);
    expect(isMachineTranslated('en')).toBe(false);
  });
});

describe('languageName', () => {
  it.each([
    ['en', 'English'],
    ['es', 'Español'],
  ] as const)('names %s in its own language, capitalised', (locale, name) => {
    expect(languageName(locale)).toBe(name);
  });
});
