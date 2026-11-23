import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type en from '../../../messages/en.json';

/** The messages of a locale, keyed as English's are. */
export type Messages = Omit<typeof en, '$schema'>;

/**
 * A locale's messages as its file gives them, so tests check rendered text against the file, not a copy of it. Read
 * from the package's directory, where Vitest runs: under happy-dom, `import.meta.url` is not a file URL. The messages
 * test checks that every locale has every English message.
 */
export function messagesOf(locale: string): Messages {
  return JSON.parse(readFileSync(resolve('messages', `${locale}.json`), 'utf8')) as Messages;
}
