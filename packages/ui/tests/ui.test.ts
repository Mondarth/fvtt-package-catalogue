import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { dateLocaleOf, datesIn } from '../src/dates.js';
import * as ui from '../src/index.js';
import { languageName } from '../src/language.js';
import Dated from './support/Dated.svelte';

const WHEN = new Date('2026-11-22T09:05:00Z');

describe('the package', () => {
  it('gives every piece', () => {
    expect(Object.keys(ui).sort()).toEqual([
      'AppShell',
      'Badge',
      'Button',
      'Callout',
      'Checkbox',
      'Dialog',
      'Field',
      'LanguagePicker',
      'Logo',
      'Notice',
      'Panel',
      'Table',
      'TopBar',
      'UserMenu',
    ]);
  });
});

describe('the locale dates are written in', () => {
  it("is the first of the reader's languages that is a regional form of the page's", () => {
    expect(dateLocaleOf('fr-FR, en-GB;q=0.9, en-US;q=0.8', 'en')).toBe('en-GB');
    expect(dateLocaleOf('en-us', 'en')).toBe('en-US');
    expect(dateLocaleOf('es-MX,es;q=0.9', 'es')).toBe('es-MX');
  });

  it("is the page's language where none is, or the header names none it knows", () => {
    expect(dateLocaleOf(null, 'en')).toBe('en');
    expect(dateLocaleOf('en', 'en')).toBe('en');
    expect(dateLocaleOf('fr-FR', 'en')).toBe('en');
    expect(dateLocaleOf('en-!!, en-GB', 'en')).toBe('en-GB');
    expect(dateLocaleOf(';q=1,-', 'en')).toBe('en');
  });
});

describe('writing dates', () => {
  it('writes days, and days with times, in the locale', () => {
    expect(datesIn('en-GB').date(WHEN)).toBe('22/11/2026');
    expect(datesIn('en-US').date(WHEN)).toBe('11/22/2026');
    expect(datesIn('en-GB').dateTime(WHEN)).toBe(WHEN.toLocaleString('en-GB'));
  });

  it("writes them in the locale a layout set, or the page's language where none is", () => {
    const set = render(Dated, { locale: 'en-GB', when: WHEN });
    expect(set.getByTestId('date')).toHaveTextContent('22/11/2026');
    expect(set.getByTestId('time')).toHaveTextContent(WHEN.toLocaleString('en-GB'));
    set.unmount();
    const none = render(Dated, { locale: null, when: WHEN });
    expect(none.getByTestId('date')).toHaveTextContent('11/22/2026');
  });
});

describe('languages', () => {
  it('are named in themselves, with a capital', () => {
    expect(languageName('en')).toBe('English');
    expect(languageName('es')).toBe('Español');
  });
});
