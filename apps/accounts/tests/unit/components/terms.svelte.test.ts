import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Terms from '../../../src/routes/terms/+page.svelte';
import { inLocale } from '../support/locale.js';
import { messagesOf } from '../support/messages.js';

const es = messagesOf('es');

/** Clause C.X.2, the governing law: the user's own wording, which must never change. */
const LAW = [
  'This Agreement, and any dispute or claim (including non-contractual disputes or claims) arising out of or in connection with it or its subject matter or formation, shall be governed by and construed exclusively in accordance with the laws of England and Wales, without regard to its conflict of laws principles.',
  'The parties irrevocably submit to the exclusive jurisdiction of the courts of England and Wales in respect of any dispute or claim (including non-contractual disputes or claims) arising out of or in connection with this Agreement or its subject matter or formation, and waive any objection to proceedings in those courts on the grounds of venue or on the basis that proceedings were brought in an inconvenient forum.',
  'Nothing in this clause deprives a consumer of the mandatory protections of the law of their country of habitual residence.',
];

/** The page's text, its white space as a reader sees it. */
const textOf = (element: HTMLElement) => element.textContent.replace(/\s+/g, ' ');

describe('the Terms and Conditions', () => {
  it('are the terms, in English, in their sections, from A to D', () => {
    render(Terms);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mondarth: Terms and Conditions');
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'en');
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
      'Introduction',
      'A. Scope of Services',
      'B. Use of the Platform',
      'C. General Provisions',
      'D. Contact Us',
    ]);
    expect(screen.getByText(/^Last updated: /)).toHaveTextContent('Last updated: 25 November 2026.');
    // No note on the English page.
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('give the governing law word for word', () => {
    render(Terms);
    const text = textOf(screen.getByRole('article'));
    for (const paragraph of LAW) expect(text).toContain(paragraph);
  });

  it('give the contact address, and link what is stored', () => {
    render(Terms);
    expect(screen.getByRole('link', { name: 'support@mondarth.com' })).toHaveAttribute(
      'href',
      'mailto:support@mondarth.com',
    );
    for (const link of screen.getAllByRole('link', { name: '/privacy' }))
      expect(link).toHaveAttribute('href', '/privacy');
  });

  it('say, on a page in another language, that the English governs', () => {
    inLocale('es');
    render(Terms);
    expect(screen.getByRole('note')).toHaveTextContent(es.terms_in_english);
  });
});
