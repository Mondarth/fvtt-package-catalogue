import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import EndpointList from '../../../src/lib/components/EndpointList.svelte';
import { inLocale } from '../support/locale.js';
import { messagesOf } from '../support/messages.js';

const endpoints = [
  { method: 'GET', path: '/api/v1/status', summary: () => 'What the catalogue holds.' },
  { method: 'GET', path: '/api/v1/other', summary: () => 'Something else.' },
] as const;

describe('EndpointList', () => {
  it('lists each endpoint with its method and summary', () => {
    render(EndpointList, { endpoints });
    expect(screen.getByRole('heading', { name: 'Endpoints' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('GET /api/v1/status');
    expect(items[0]).toHaveTextContent('What the catalogue holds.');
  });

  it('says when there are none', () => {
    render(EndpointList, { endpoints: [] });
    expect(screen.getByText('No endpoints yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('speaks the page’s language', () => {
    inLocale('es');
    const es = messagesOf('es');
    render(EndpointList, { endpoints: [] });
    expect(screen.getByRole('heading', { name: es.endpoints_heading })).toBeInTheDocument();
    expect(screen.getByText(es.endpoints_none)).toBeInTheDocument();
  });

  it('leaves nothing behind when unmounted', () => {
    const { unmount, container } = render(EndpointList, { endpoints: [] });
    unmount();
    expect(container).toBeEmptyDOMElement();
  });
});
