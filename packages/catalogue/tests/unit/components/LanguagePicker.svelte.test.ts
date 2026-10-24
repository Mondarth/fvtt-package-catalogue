import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import LanguagePicker from '../../../src/lib/components/LanguagePicker.svelte';
import { inLocale } from '../support/locale.js';
import { messagesOf } from '../support/messages.js';

describe('LanguagePicker', () => {
  it('offers every language, each named in itself, with the current one chosen', () => {
    render(LanguagePicker, { current: 'en', choose: vi.fn() });
    const picker = screen.getByRole('combobox', { name: 'Language' });
    expect(picker).toHaveValue('en');
    const options = screen.getAllByRole('option');
    expect(options.map(option => [option.textContent, option.getAttribute('lang')])).toEqual([
      ['English', 'en'],
      ['Español', 'es'],
    ]);
  });

  it('switches to the language chosen', async () => {
    const choose = vi.fn();
    render(LanguagePicker, { current: 'en', choose });
    await userEvent.selectOptions(screen.getByRole('combobox'), 'es');
    expect(choose).toHaveBeenCalledExactlyOnceWith('es');
  });

  it('does nothing when the current language is chosen again', async () => {
    const choose = vi.fn();
    render(LanguagePicker, { current: 'es', choose });
    await userEvent.selectOptions(screen.getByRole('combobox'), 'es');
    expect(choose).not.toHaveBeenCalled();
  });

  it('is labelled in the page’s language, and starts from it', () => {
    inLocale('es');
    render(LanguagePicker);
    expect(screen.getByRole('combobox', { name: messagesOf('es').language_label })).toHaveValue('es');
  });

  it('by default, sets the chosen language and reloads the page in it', async () => {
    const runtime = await import('../../../src/lib/paraglide/runtime.js');
    const set = vi.fn();
    runtime.overwriteSetLocale(set);
    render(LanguagePicker, { current: 'en' });
    await userEvent.selectOptions(screen.getByRole('combobox'), 'es');
    expect(set).toHaveBeenCalledExactlyOnceWith('es');
  });
});
