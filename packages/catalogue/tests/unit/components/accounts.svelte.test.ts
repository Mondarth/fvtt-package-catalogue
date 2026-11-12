import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { STORED } from '../../../src/lib/stored.js';
import Privacy from '../../../src/routes/privacy/+page.svelte';
import Profile from '../../../src/routes/profile/+page.svelte';
import { inLocale } from '../support/locale.js';
import { messagesOf } from '../support/messages.js';

const en = messagesOf('en');

/** The value a description list gives for a term. */
const valueOf = (term: string) => screen.getByText(term, { selector: 'dt' }).nextElementSibling;
const es = messagesOf('es');

describe('the "What we store" page', () => {
  it('lists everything signing in stores, where it comes from and what it is for, and how long it is kept', () => {
    render(Privacy);
    expect(screen.getByRole('heading', { level: 1, name: en.privacy_heading })).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(STORED.length);
    const email = rows.find(row => row.dataset.stored === 'email');
    expect(email).toHaveTextContent(en.privacy_email_what);
    expect(email).toHaveTextContent(en.privacy_from_provider);
    expect(email).toHaveTextContent(en.privacy_email_why);
    expect(rows.find(row => row.dataset.stored === 'nickname')).toHaveTextContent(en.privacy_from_you);
    expect(rows.find(row => row.dataset.stored === 'device')).toHaveTextContent(en.privacy_from_browser);
    expect(rows.find(row => row.dataset.stored === 'handle')).toHaveTextContent(en.privacy_from_us);
    expect(screen.getByRole('region', { name: en.privacy_kept_heading })).toHaveTextContent(en.privacy_kept);
    expect(screen.getByRole('region', { name: en.privacy_cookies_heading })).toHaveTextContent(en.privacy_cookies);
  });

  it('is in Spanish for a Spanish visitor', () => {
    inLocale('es');
    render(Privacy);
    expect(screen.getByRole('heading', { level: 1, name: es.privacy_heading })).toBeInTheDocument();
  });
});

describe('the profile page', () => {
  const PROFILE = {
    handle: 'amber-fox-oak-01',
    nickname: null as string | null,
    name: 'Test One',
    email: 'one@example.test',
    image: null as string | null,
    providers: ['github'],
  };

  const profile = (
    data: Partial<{ profile: typeof PROFILE; problem: 'stale' | 'unconfirmed' | null; saved: boolean }> = {},
    form: unknown = null,
  ) => render(Profile, { data: { profile: PROFILE, problem: null, saved: false, ...data }, form, params: {} } as never);

  it('shows the user id, the nickname field, and what is stored about them', () => {
    profile();
    expect(screen.getByRole('heading', { level: 1, name: en.profile_heading })).toBeInTheDocument();
    expect(screen.getByText(PROFILE.handle)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: en.nickname_label })).toHaveValue('');
    const stored = screen.getByRole('region', { name: en.profile_stored_heading });
    expect(stored).toHaveTextContent(PROFILE.email);
    expect(stored).toHaveTextContent('GitHub');
    expect(valueOf(en.profile_picture)).toHaveTextContent(en.profile_none);
    expect(within(stored).getByRole('link', { name: en.privacy_link })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('button', { name: en.sign_out }).closest('form')).toHaveAttribute('action', '/sign-out');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the nickname set, the picture, and none for no provider', () => {
    profile({ profile: { ...PROFILE, nickname: 'Ulenar', image: 'https://img.test/a.png', providers: [] } });
    expect(screen.getByRole('textbox', { name: en.nickname_label })).toHaveValue('Ulenar');
    const stored = screen.getByRole('region', { name: en.profile_stored_heading });
    expect(stored).toHaveTextContent('https://img.test/a.png');
    expect(valueOf(en.profile_providers)).toHaveTextContent(en.profile_none);
  });

  it('says the nickname was saved', () => {
    profile({ saved: true });
    expect(screen.getByRole('status')).toHaveTextContent(en.nickname_saved);
  });

  it.each([
    ['length', en.nickname_problem_length],
    ['characters', en.nickname_problem_characters],
    ['reserved', en.nickname_problem_reserved],
    ['taken', en.nickname_problem_taken],
  ])('says why a nickname could not be kept: %s, keeping what was typed', (problem, message) => {
    profile({ saved: true }, { given: 'ab', problem });
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('textbox', { name: en.nickname_label })).toHaveValue('ab');
    expect(screen.getByRole('textbox', { name: en.nickname_label })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('asks to confirm deleting the profile, and says why it could not be', () => {
    profile({ problem: 'stale' });
    const deletion = screen.getByRole('region', { name: en.delete_heading });
    expect(within(deletion).getByRole('checkbox', { name: en.delete_confirm })).toBeRequired();
    expect(within(deletion).getByRole('button', { name: en.delete_button }).closest('form')).toHaveAttribute(
      'action',
      '/profile/delete',
    );
    expect(within(deletion).getByRole('alert')).toHaveTextContent(en.delete_stale);
  });

  it('asks for the box to be ticked', () => {
    profile({ problem: 'unconfirmed' });
    expect(screen.getByRole('alert')).toHaveTextContent(en.delete_unconfirmed);
  });
});
