import { describe, expect, it } from 'vitest';

import { isReturnSite, returnFrom, returnPage } from '../../../../src/lib/server/accounts/return-to.js';

const CATALOGUE = 'https://catalogue.example.org';

describe('the way back to another application', () => {
  it('is a page of an application the accounts know, never one of their own', () => {
    expect(returnPage(`${CATALOGUE}/developers?q=1`, [CATALOGUE])).toBe(`${CATALOGUE}/developers?q=1`);
    expect(returnPage('/profile', [CATALOGUE])).toBeUndefined();
    expect(returnPage('https://elsewhere.example/', [CATALOGUE])).toBeUndefined();
    expect(returnPage(null, [CATALOGUE])).toBeUndefined();
  });

  it("is to one of Mondarth's applications", () => {
    expect(['mondarth', 'catalogue', 'aide'].every(isReturnSite)).toBe(true);
    expect(isReturnSite('accounts')).toBe(false);
    expect(isReturnSite(null)).toBe(false);
  });

  it("is read from a page's address: the page, and its site", () => {
    const at = (query: string) => new URL(`http://accounts.test/profile${query}`);
    expect(returnFrom(at(`?next=${encodeURIComponent(`${CATALOGUE}/`)}&from=catalogue`), [CATALOGUE])).toEqual({
      url: `${CATALOGUE}/`,
      site: 'catalogue',
    });
    expect(returnFrom(at(`?next=${encodeURIComponent(`${CATALOGUE}/`)}`), [CATALOGUE])).toBeUndefined();
    expect(returnFrom(at('?from=catalogue'), [CATALOGUE])).toBeUndefined();
  });
});
