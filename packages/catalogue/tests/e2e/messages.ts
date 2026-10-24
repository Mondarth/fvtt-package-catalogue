import { readFileSync } from 'node:fs';

import type en from '../../messages/en.json';

/** A locale's messages, from its file, so the tests check the page against the file and not a copy of it. */
export function messagesOf(locale: string): Omit<typeof en, '$schema'> {
  return JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8')) as Omit<
    typeof en,
    '$schema'
  >;
}
