import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import { ENDPOINTS } from '../../../src/lib/endpoints.js';
import Error from '../../../src/routes/+error.svelte';
import Layout from '../../../src/routes/+layout.svelte';
import Page from '../../../src/routes/+page.svelte';
import Developers from '../../../src/routes/developers/+page.svelte';
import { inLocale } from '../support/locale.js';
import { messagesOf } from '../support/messages.js';

const state = vi.hoisted(() => ({ page: { status: 404 } }));
vi.mock('$app/state', () => state);

const en = messagesOf('en');
const es = messagesOf('es');

describe('the home page', () => {
  const home = (data: { signedIn: { name: string } | null; providers: string[]; failed: boolean }) =>
    render(Page, { data, params: {}, form: undefined } as never);

  it('asks a visitor to sign in, saying first what that stores, with a button for each provider', () => {
    home({ signedIn: null, providers: ['github', 'test'], failed: false });
    expect(screen.getByRole('heading', { level: 1, name: en.sign_in_heading })).toBeInTheDocument();
    expect(screen.getByText(en.sign_in_stores)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.privacy_link })).toHaveAttribute('href', '/privacy');
    const github = screen.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'GitHub') });
    expect(github.closest('form')).toHaveAttribute('action', '/sign-in/github');
    expect(github.closest('form')).toHaveAttribute('method', 'POST');
    expect(
      screen.getByRole('button', { name: en.sign_in_with.replace('{provider}', 'Test provider') }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.developers_link })).toHaveAttribute('href', '/developers');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when a sign-in did not work, or when there is no provider to sign in with', () => {
    home({ signedIn: null, providers: [], failed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(en.sign_in_failed);
    expect(screen.getByText(en.sign_in_none)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is the workspace once signed in', () => {
    home({ signedIn: { name: 'Ulenar' }, providers: [], failed: false });
    expect(screen.getByRole('heading', { level: 1, name: en.workspace_label })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('the API page', () => {
  it('introduces the catalogue and lists every endpoint', () => {
    render(Developers);
    expect(screen.getByRole('heading', { level: 1, name: en.developers_heading })).toBeInTheDocument();
    expect(screen.getByText(en.home_lede)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(ENDPOINTS.length);
    expect(screen.getByText(en.endpoint_lookup_summary)).toBeInTheDocument();
  });

  it('is in Spanish for a Spanish visitor', () => {
    inLocale('es');
    render(Developers);
    expect(screen.getByRole('heading', { level: 1, name: es.developers_heading })).toBeInTheDocument();
    expect(screen.getByText(es.endpoint_status_summary)).toBeInTheDocument();
  });
});

describe('the layout', () => {
  const children = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));

  it('renders the page in its main landmark, with a language picker and no notice in English', () => {
    render(Layout, { children, params: {}, data: { signedIn: null } });
    expect(screen.getByRole('main')).toHaveTextContent('Page content');
    expect(screen.getByRole('combobox', { name: en.language_label })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says a machine translated page was translated by machine', () => {
    inLocale('es');
    render(Layout, { children, params: {}, data: { signedIn: null } });
    expect(screen.getByRole('note')).toHaveTextContent(es.machine_translation_notice);
  });

  it('puts the workspace bar along the top once signed in, the profile button at its far right', () => {
    render(Layout, { children, params: {}, data: { signedIn: { name: 'Ulenar' } } });
    const bar = screen.getByRole('navigation', { name: en.workspace_label });
    const profile = screen.getByRole('link', { name: en.profile_button_label.replace('{name}', 'Ulenar') });
    expect(profile).toHaveTextContent(/^\s*Ulenar\s*$/);
    expect(profile).toHaveAttribute('href', '/profile');
    expect(bar.lastElementChild).toBe(profile);
    expect(screen.getByRole('combobox', { name: en.language_label })).toBeInTheDocument();
  });
});

describe('the error page', () => {
  it('says there is no page for a 404', () => {
    state.page.status = 404;
    render(Error);
    expect(screen.getByRole('heading', { name: 'Error 404' })).toBeInTheDocument();
    expect(screen.getByText(en.error_not_found)).toBeInTheDocument();
  });

  it('apologises for any other error, in the page’s language', () => {
    inLocale('es');
    state.page.status = 500;
    render(Error);
    expect(screen.getByText(es.error_other)).toBeInTheDocument();
  });
});
