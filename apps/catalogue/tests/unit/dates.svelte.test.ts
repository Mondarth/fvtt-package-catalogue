import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Dated from './support/Dated.svelte';
import InLayout from './support/InLayout.svelte';

const WHEN = new Date('2026-11-22T09:05:00Z');

describe('writing dates, as the catalogue does', () => {
  it("writes them in the locale the layout set, or the page's language where none is", () => {
    const set = render(Dated, { locale: 'en-GB', when: WHEN });
    expect(set.getByTestId('date')).toHaveTextContent('22/11/2026');
    expect(set.getByTestId('time')).toHaveTextContent(WHEN.toLocaleString('en-GB'));
    set.unmount();
    const none = render(Dated, { locale: null, when: WHEN });
    expect(none.getByTestId('date')).toHaveTextContent('11/22/2026');
  });
});

describe('the root layout', () => {
  it('has every date under it written in the locale the server worked out for the reader', () => {
    const { getByTestId } = render(InLayout, { dateLocale: 'en-GB', when: WHEN });
    expect(getByTestId('date')).toHaveTextContent('22/11/2026');
  });
});
