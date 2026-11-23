import { afterEach } from 'vitest';

import { getLocale, overwriteGetLocale, type Locale } from '../../../src/lib/paraglide/runtime.js';

const original = getLocale;

/** Renders what follows in a locale, restoring the runtime's own choice after each test. */
export function inLocale(locale: Locale): void {
  overwriteGetLocale(() => locale);
}

afterEach(() => {
  overwriteGetLocale(original);
});
