import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import dark from '../src/assets/brand/logo-dark.svg';
import light from '../src/assets/brand/logo-light.svg';
import { dateLocaleOf, datesIn } from '../src/dates.js';
import * as ui from '../src/index.js';
import { languageName } from '../src/language.js';
import LanguagePicker from '../src/LanguagePicker.svelte';
import Logo from '../src/Logo.svelte';
import Bar from './support/Bar.svelte';
import Dated from './support/Dated.svelte';
import Noted from './support/Noted.svelte';

const WHEN = new Date('2026-11-22T09:05:00Z');

describe('the package', () => {
  it('gives every piece', () => {
    expect(Object.keys(ui).sort()).toEqual(['Callout', 'LanguagePicker', 'Logo', 'Notice', 'TopBar']);
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

  it('are picked from, each named in itself, the current one chosen, choosing another switching to it', async () => {
    const choose = vi.fn();
    render(LanguagePicker, { label: 'Language', locales: ['en', 'es'], current: 'en', choose });
    const picker = screen.getByRole('combobox', { name: 'Language' });
    expect(picker).toHaveValue('en');
    expect(screen.getAllByRole('option').map(option => [option.textContent, option.getAttribute('lang')])).toEqual([
      ['English', 'en'],
      ['Español', 'es'],
    ]);
    await userEvent.selectOptions(picker, 'en');
    expect(choose).not.toHaveBeenCalled();
    await userEvent.selectOptions(picker, 'es');
    expect(choose).toHaveBeenCalledExactlyOnceWith('es');
  });
});

describe('the top bar', () => {
  it('has its menu, what goes beside it, and the profile button at the far right, naming the user', () => {
    render(Bar, { links: [{ href: '/subscription', label: 'Subscription' }], beside: true });
    const bar = screen.getByRole('navigation', { name: 'Workspace' });
    expect(screen.getByRole('link', { name: 'Subscription' })).toHaveAttribute('href', '/subscription');
    expect(bar).toHaveTextContent('Beside');
    const profile = screen.getByRole('link', { name: 'Profile: Ulenar' });
    expect(profile).toHaveAttribute('href', '/profile');
    expect(profile).toHaveTextContent('Ulenar');
    expect(bar.lastElementChild).toBe(profile);
  });

  it('has nothing beside its menu where it is given nothing', () => {
    render(Bar, { links: [], beside: false });
    expect(screen.getByRole('navigation')).not.toHaveTextContent('Beside');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});

describe('notices and callouts', () => {
  it('note what they say, a callout as an alert that takes the focus', () => {
    render(Noted, { text: 'Machine translated', id: 'about' });
    expect(screen.getByRole('note')).toHaveTextContent('Machine translated');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Machine translated');
    expect(alert).toHaveAttribute('id', 'about');
    expect(alert).toHaveFocus();
  });
});

describe('the logo', () => {
  it('is the light one, or the dark one where the browser prefers dark, at the height given', () => {
    const { container } = render(Logo, { height: '2rem', alt: 'Mondarth' });
    const image = screen.getByRole('img', { name: 'Mondarth' });
    expect(image).toHaveAttribute('src', light);
    expect(image.style.height).toBe('2rem');
    const source = container.querySelector('source');
    expect(source?.getAttribute('media')).toBe('(prefers-color-scheme: dark)');
    expect(source).toHaveAttribute('srcset', dark);
  });

  it('says nothing to a screen reader by default', () => {
    render(Logo, { height: '1rem' });
    expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute('alt', '');
  });
});
