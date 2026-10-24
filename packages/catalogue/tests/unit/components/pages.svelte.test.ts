import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import { ENDPOINTS } from '../../../src/lib/endpoints.js';
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
  it('introduces the catalogue and lists every endpoint', () => {
    render(Page);
    expect(screen.getByRole('heading', { level: 1, name: en.site_title })).toBeInTheDocument();
    expect(screen.getByText(en.home_lede)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(ENDPOINTS.length);
    expect(screen.getByText(en.endpoint_releases_summary)).toBeInTheDocument();
  });

  it('is in Spanish for a Spanish visitor', () => {
    inLocale('es');
    render(Page);
    expect(screen.getByRole('heading', { level: 1, name: es.site_title })).toBeInTheDocument();
    expect(screen.getByText(es.endpoint_status_summary)).toBeInTheDocument();
  });
});

describe('the layout', () => {
  const children = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));

  it('renders the page in its main landmark, with a language picker and no notice in English', () => {
    render(Layout, { children, params: {}, data: {} });
    expect(screen.getByRole('main')).toHaveTextContent('Page content');
    expect(screen.getByRole('combobox', { name: en.language_label })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says a machine translated page was translated by machine', () => {
    inLocale('es');
    render(Layout, { children, params: {}, data: {} });
    expect(screen.getByRole('note')).toHaveTextContent(es.machine_translation_notice);
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
