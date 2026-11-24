import { describe, expect, it } from 'vitest';

import { nextPath } from '../../../../src/lib/server/accounts/next.js';

describe('nextPath', () => {
  it('takes a path of this site, with its query', () => {
    expect(nextPath('/device?user_code=WDJBMJHT')).toBe('/device?user_code=WDJBMJHT');
    expect(nextPath('/profile')).toBe('/profile');
  });

  it.each([
    'https://elsewhere.example/',
    '//elsewhere.example/path',
    '/\\elsewhere.example',
    '/path\\with\\backslashes',
    '/path\nwith a new line',
    'relative/path',
    '',
    null,
    42,
  ])('goes home for %j', given => {
    expect(nextPath(given)).toBe('/');
  });

  it("takes a page of another Mondarth application's, by an origin it knows", () => {
    const apps = ['https://catalogue.example.org'];
    expect(nextPath('https://catalogue.example.org/developers?x=1', apps)).toBe(
      'https://catalogue.example.org/developers?x=1',
    );
    expect(nextPath('https://catalogue.example.org', apps)).toBe('https://catalogue.example.org/');
  });

  it.each([
    'https://elsewhere.example/',
    'https://catalogue.example.org.elsewhere.example/',
    'http://catalogue.example.org/',
    'https://someone:secret@catalogue.example.org/',
    'https://someone@catalogue.example.org/',
    'not a url at all',
  ])('goes home for %j, an origin it does not know or a URL with credentials', given => {
    expect(nextPath(given, ['https://catalogue.example.org'])).toBe('/');
  });
});
