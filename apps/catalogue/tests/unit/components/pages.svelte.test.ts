import { render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import { ENDPOINTS } from '../../../src/lib/endpoints.js';
import Error from '../../../src/routes/+error.svelte';
import Layout from '../../../src/routes/+layout.svelte';
import Page from '../../../src/routes/+page.svelte';
import Developers from '../../../src/routes/developers/+page.svelte';
import { inLocale } from '../support/locale.js';
import { messagesOf } from '../support/messages.js';

const state = vi.hoisted(() => ({ page: { status: 404, url: new URL('https://catalogue.example.org/') } }));
vi.mock('$app/state', () => state);

const en = messagesOf('en');
const es = messagesOf('es');
const SITE = 'https://accounts.example.org';
const USER = { name: 'Ulenar', admin: false, impersonated: false };

describe('the home page', () => {
  const home = (signedIn: typeof USER | null) =>
    render(Page, { data: { signedIn, accountsSite: SITE }, params: {} } as never);

  it('says what the catalogue is, linking its API, and leaves the Terms and what is stored to the footer', () => {
    home(null);
    expect(screen.getByRole('heading', { level: 1, name: en.site_title })).toBeInTheDocument();
    expect(screen.getByText(en.home_lede)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.developers_link })).toHaveAttribute('href', '/developers');
    expect(screen.queryByRole('link', { name: en.privacy_link })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: en.terms_link })).not.toBeInTheDocument();
  });

  it('leaves signing in to the bar', () => {
    home(null);
    expect(screen.queryByRole('link', { name: en.sign_in_heading })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: en.sign_in_register })).not.toBeInTheDocument();
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
  const layout = (signedIn: typeof USER | null) =>
    render(Layout, { children, params: {}, data: { signedIn, accountsSite: SITE } });

  it('renders the page in its main landmark, with a language picker and no notice in English', () => {
    layout(null);
    expect(screen.getByRole('main')).toHaveTextContent('Page content');
    expect(screen.getByRole('link', { name: en.home_link })).toHaveAttribute('href', '/');
    expect(screen.getByRole('combobox', { name: en.language_label })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('offers a visitor to sign in or register, at the accounts, which send them back here', () => {
    layout(null);
    const bar = screen.getByRole('navigation', { name: en.workspace_label });
    const signIn = screen.getByRole('link', { name: en.sign_in_register });
    expect(signIn).toHaveAttribute('href', `${SITE}/?next=${encodeURIComponent('https://catalogue.example.org/')}`);
    expect(bar.lastElementChild).toBe(signIn);
  });

  it("links the Terms and what is stored, the accounts', at the foot of every page, with the way back here", () => {
    layout(null);
    const foot = screen.getByRole('contentinfo');
    const back = `?next=${encodeURIComponent('https://catalogue.example.org/')}&from=catalogue`;
    expect(within(foot).getByRole('link', { name: en.terms_link })).toHaveAttribute('href', `${SITE}/terms${back}`);
    expect(within(foot).getByRole('link', { name: en.privacy_link })).toHaveAttribute('href', `${SITE}/privacy${back}`);
  });

  it('says a machine translated page was translated by machine', () => {
    inLocale('es');
    layout(null);
    expect(screen.getByRole('note')).toHaveTextContent(es.machine_translation_notice);
  });

  it("puts the profile menu in the bar once signed in: the accounts' pages, and signing out here", () => {
    layout(USER);
    const bar = screen.getByRole('navigation', { name: en.workspace_label });
    const profile = screen.getByLabelText(en.profile_button_label.replace('{name}', 'Ulenar'));
    expect(profile).toHaveAccessibleName(en.profile_button_label.replace('{name}', 'Ulenar'));
    expect(bar.lastElementChild).toBe(profile.closest('details'));
    const link = (name: string) => screen.getByRole('link', { name, hidden: true });
    // The accounts' pages, with the way back to this one; not the admin pages, gone to on purpose.
    const back = `?next=${encodeURIComponent('https://catalogue.example.org/')}&from=catalogue`;
    expect(link(en.profile_link)).toHaveAttribute('href', `${SITE}/profile${back}`);
    expect(link(en.subscription_link)).toHaveAttribute('href', `${SITE}/subscription${back}`);
    expect(screen.queryByRole('link', { name: en.admin_link, hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.sign_out, hidden: true }).closest('form')).toHaveAttribute(
      'action',
      '/sign-out',
    );
    expect(screen.queryByRole('link', { name: en.sign_in_register })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('links the admin pages for an admin, and says whom an admin views the site as, stopped at the accounts', () => {
    layout({ name: 'Ulenar', admin: true, impersonated: true });
    expect(screen.getByRole('link', { name: en.admin_link, hidden: true })).toHaveAttribute('href', `${SITE}/admin`);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(en.impersonation_banner.replace('{name}', 'Ulenar'));
    expect(screen.getByRole('link', { name: en.impersonation_stop_at_accounts })).toHaveAttribute('href', SITE);
  });
});

describe('the error page', () => {
  it('says there is no page for a 404, and apologises for anything else', () => {
    state.page.status = 404;
    render(Error);
    expect(screen.getByText(en.error_not_found)).toBeInTheDocument();
    state.page.status = 500;
    render(Error);
    expect(screen.getByText(en.error_other)).toBeInTheDocument();
  });
});
