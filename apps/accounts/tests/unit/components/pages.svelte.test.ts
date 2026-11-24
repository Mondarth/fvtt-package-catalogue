import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import Error from '../../../src/routes/+error.svelte';
import Layout from '../../../src/routes/+layout.svelte';
import Page from '../../../src/routes/+page.svelte';
import { inLocale } from '../support/locale.js';
import { messagesOf } from '../support/messages.js';

const state = vi.hoisted(() => ({ page: { status: 404 } }));
vi.mock('$app/state', () => state);

const en = messagesOf('en');
const es = messagesOf('es');

describe('the home page', () => {
  const home = (data: { signedIn: { name: string } | null; providers: string[]; failed: boolean; banned?: unknown }) =>
    render(Page, { data: { banned: null, ...data }, params: {}, form: undefined } as never);

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
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the logo above the heading, unnamed, as the heading names the page', () => {
    home({ signedIn: null, providers: [], failed: false });
    const logo = document.querySelector('main img, picture img');
    expect(logo).toHaveAttribute('alt', '');
  });

  it('says when a sign-in did not work, or when there is no provider to sign in with', () => {
    home({ signedIn: null, providers: [], failed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(en.sign_in_failed);
    expect(screen.getByText(en.sign_in_none)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // Regression: a banned user was told only that signing in did not work.
  it('tells a banned user until when, and why', () => {
    const until = new Date('2026-12-01T00:00:00Z');
    home({ signedIn: null, providers: [], failed: true, banned: { known: true, reason: 'Spam', until } });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(en.sign_in_banned_until.replace('{date}', until.toLocaleString('en')));
    expect(alert).toHaveTextContent(en.sign_in_banned_reason.replace('{reason}', 'Spam'));
    expect(alert).not.toHaveTextContent(en.sign_in_failed);
  });

  it('tells a user banned for good, without a reason given, so', () => {
    home({ signedIn: null, providers: [], failed: true, banned: { known: true, reason: null, until: null } });
    expect(screen.getByRole('alert')).toHaveTextContent(en.sign_in_banned_forever);
    expect(screen.getByRole('alert')).not.toHaveTextContent(en.sign_in_banned_reason.replace('{reason}', ''));
  });

  it('says only that the profile is banned when the page cannot tell more', () => {
    home({ signedIn: null, providers: [], failed: true, banned: { known: false } });
    expect(screen.getByRole('alert')).toHaveTextContent(en.sign_in_banned);
  });

  it('is the workspace once signed in', () => {
    home({ signedIn: { name: 'Ulenar' }, providers: [], failed: false });
    expect(screen.getByRole('heading', { level: 1, name: en.workspace_label })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('the layout', () => {
  const children = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));

  it('renders the page in its main landmark, with a language picker and no notice in English', () => {
    render(Layout, { children, params: {}, data: { dateLocale: 'en-GB', signedIn: null } });
    expect(screen.getByRole('main')).toHaveTextContent('Page content');
    expect(screen.getByRole('combobox', { name: en.language_label })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says a machine translated page was translated by machine', () => {
    inLocale('es');
    render(Layout, { children, params: {}, data: { dateLocale: 'en-GB', signedIn: null } });
    expect(screen.getByRole('note')).toHaveTextContent(es.machine_translation_notice);
  });

  it('puts the logo at the far left of the top, linking home, the dark one where the browser prefers dark', () => {
    render(Layout, { children, params: {}, data: { dateLocale: 'en-GB', signedIn: null } });
    const home = screen.getByRole('link', { name: en.home_link });
    expect(home).toHaveAttribute('href', '/');
    expect(home.closest('header')?.firstElementChild).toBe(home);
    const source = home.querySelector('picture source');
    expect(source).toHaveAttribute('media', '(prefers-color-scheme: dark)');
    // Small enough for Vite to inline, or else a file of their own: SVG either way, and not the same one.
    const dark = source?.getAttribute('srcset') ?? '';
    const light = home.querySelector('img')?.getAttribute('src') ?? '';
    expect(dark).toMatch(/svg/);
    expect(light).toMatch(/svg/);
    expect(dark).not.toBe(light);
  });

  it('puts the workspace bar along the top once signed in, the profile button at its far right', () => {
    render(Layout, {
      children,
      params: {},
      data: { dateLocale: 'en-GB', signedIn: { name: 'Ulenar', admin: false, impersonated: false } },
    });
    const bar = screen.getByRole('navigation', { name: en.workspace_label });
    const profile = screen.getByRole('link', { name: en.profile_button_label.replace('{name}', 'Ulenar') });
    expect(profile).toHaveTextContent(/^\s*Ulenar\s*$/);
    expect(profile).toHaveAttribute('href', '/profile');
    expect(bar.lastElementChild).toBe(profile);
    expect(screen.getByRole('combobox', { name: en.language_label })).toBeInTheDocument();
  });
});

describe('the layout, for an admin and while an admin views the site as someone', () => {
  const children = createRawSnippet(() => ({ render: () => '<p>The page</p>' }));

  it('links the admin pages in the bar for an admin alone', () => {
    render(Layout, {
      children,
      params: {},
      data: { dateLocale: 'en-GB', signedIn: { name: 'Ulenar', admin: true, impersonated: false } },
    });
    expect(screen.getByRole('link', { name: en.admin_link })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: en.subscription_link })).toHaveAttribute('href', '/subscription');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says on every page whom the site is viewed as, with a button to stop', () => {
    render(Layout, {
      children,
      params: {},
      data: { dateLocale: 'en-GB', signedIn: { name: 'Ulenar', admin: false, impersonated: true } },
    });
    expect(screen.queryByRole('link', { name: en.admin_link })).not.toBeInTheDocument();
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(en.impersonation_banner.replace('{name}', 'Ulenar'));
    expect(screen.getByRole('button', { name: en.impersonation_stop }).closest('form')).toHaveAttribute(
      'action',
      '/impersonation/stop',
    );
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
