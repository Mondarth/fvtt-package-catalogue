import { describe, expect, it } from 'vitest';

import { keyMatcher } from '../../../../src/lib/server/http/auth.js';

describe('keyMatcher', () => {
  const isKey = keyMatcher(['current', 'previous']);

  it.each(['current', 'previous'])('accepts %s', key => {
    expect(isKey(key)).toBe(true);
  });

  it.each([null, '', 'curren', 'current ', 'CURRENT'])('refuses %j', key => {
    expect(isKey(key)).toBe(false);
  });

  it('refuses everything when no key is accepted', () => {
    expect(keyMatcher([])('anything')).toBe(false);
  });
});
