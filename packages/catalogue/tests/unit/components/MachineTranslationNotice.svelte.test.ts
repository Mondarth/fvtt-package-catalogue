import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import MachineTranslationNotice from '../../../src/lib/components/MachineTranslationNotice.svelte';
import { inLocale } from '../support/locale.js';
import { messagesOf } from '../support/messages.js';

describe('MachineTranslationNotice', () => {
  it('says, in the language itself, that a machine translated page was translated by machine', () => {
    inLocale('es');
    render(MachineTranslationNotice);
    expect(screen.getByRole('note')).toHaveTextContent(messagesOf('es').machine_translation_notice);
  });

  it('says nothing on an English page', () => {
    render(MachineTranslationNotice, { locale: 'en' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
