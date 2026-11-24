import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MACHINE_TRANSLATED } from '../../src/lib/i18n.js';

/**
 * The website's messages: every locale translates every English message, and nothing else, keeping its placeholders.
 * A message added to en.json in a change is added to every locale in the same change.
 */

const MESSAGES = new URL('../../messages/', import.meta.url).pathname;

const settings = JSON.parse(readFileSync(new URL('../../project.inlang/settings.json', import.meta.url), 'utf8')) as {
  baseLocale: string;
  locales: string[];
};

function messages(locale: string): Record<string, string> {
  const file = JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), 'utf8')) as Record<string, unknown>;
  // $schema is the file's format marker, not a message.
  const entries = Object.entries(file).filter(([key]) => key !== '$schema');
  for (const [key, value] of entries)
    if (typeof value !== 'string') throw new Error(`${locale}.json: ${key} is not text`);
  return Object.fromEntries(entries) as Record<string, string>;
}

const placeholders = (message: string): string[] =>
  [...message.matchAll(/\{[^}]+\}/g)].map(([placeholder]) => placeholder).sort();

const base = messages(settings.baseLocale);
const translations = settings.locales.filter(locale => locale !== settings.baseLocale);

describe('the message files', () => {
  it('have English as the base locale', () => {
    expect(settings.baseLocale).toBe('en');
  });

  it('are one for each locale, and only those', () => {
    const files = readdirSync(MESSAGES)
      .filter(file => file.endsWith('.json'))
      .map(file => basename(file, '.json'));
    expect(files.sort()).toEqual([...settings.locales].sort());
  });

  it('name their messages in snake_case', () => {
    expect(Object.keys(base).filter(key => !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(key))).toEqual([]);
  });

  it('leave no English message empty', () => {
    expect(Object.entries(base).filter(([, text]) => text.trim() === '')).toEqual([]);
  });
});

describe.each(translations)('%s', locale => {
  const translated = messages(locale);

  it('translates every English message and nothing else', () => {
    expect(Object.keys(translated).sort()).toEqual(Object.keys(base).sort());
  });

  it('leaves no message empty', () => {
    expect(Object.entries(translated).filter(([, text]) => text.trim() === '')).toEqual([]);
  });

  it('keeps the placeholders of every message', () => {
    const mismatched = Object.keys(base).filter(
      key => placeholders(translated[key] ?? '').join() !== placeholders(base[key] ?? '').join(),
    );
    expect(mismatched).toEqual([]);
  });
});

describe('the machine translations', () => {
  it('are of configured locales other than English', () => {
    expect([...MACHINE_TRANSLATED].every(locale => translations.includes(locale))).toBe(true);
  });

  // Machine translated or not, a translation's notice must exist for the pages that show it.
  it.each([...MACHINE_TRANSLATED])('of %s say so in the language itself', locale => {
    expect(messages(locale).machine_translation_notice).not.toBe(base.machine_translation_notice);
  });
});
