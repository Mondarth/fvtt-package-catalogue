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
});
