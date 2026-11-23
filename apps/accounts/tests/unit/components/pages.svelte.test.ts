import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import Error from '../../../src/routes/+error.svelte';
import Layout from '../../../src/routes/+layout.svelte';
import Home from '../../../src/routes/+page.svelte';
import InLayout from '../support/InLayout.svelte';
import { inLocale } from '../support/locale.js';
import { messagesOf } from '../support/messages.js';

const page = vi.hoisted(() => ({ status: 404 }));
vi.mock('$app/state', () => ({ page }));

const en = messagesOf('en');
const es = messagesOf('es');

describe('the layout', () => {
  const children = createRawSnippet(() => ({ render: () => '<p>Page content</p>' }));

  it('renders the page in its main landmark, under the logo, linking home, and the language picker', () => {
    render(Layout, { children, params: {}, data: { dateLocale: 'en-GB' } });
    expect(screen.getByRole('main')).toHaveTextContent('Page content');
    expect(screen.getByRole('link', { name: en.home_link })).toHaveAttribute('href', '/');
    expect(screen.getByRole('combobox', { name: en.language_label })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('has every date under it written in the locale the server worked out for the reader', () => {
    render(InLayout, { dateLocale: 'en-GB', when: new Date('2026-11-22T09:05:00Z') });
    expect(screen.getByTestId('date')).toHaveTextContent('22/11/2026');
  });

  it('says a machine translated page was translated by machine', () => {
    inLocale('es');
    render(Layout, { children, params: {}, data: { dateLocale: 'es-ES' } });
    expect(screen.getByRole('note')).toHaveTextContent(es.machine_translation_notice);
  });
});

describe('the home page', () => {
  it('says what the accounts are', () => {
    render(Home, { params: {}, data: { dateLocale: 'en' } } as never);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.home_heading);
    expect(screen.getByText(en.home_intro)).toBeInTheDocument();
  });
});

describe('the error page', () => {
  it('says a page was not found, or that something went wrong', () => {
    render(Error);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('404');
    expect(screen.getByText(en.error_not_found)).toBeInTheDocument();
    page.status = 500;
    render(Error);
    expect(screen.getByText(en.error_other)).toBeInTheDocument();
  });
});
