import { describe, expect, it } from 'vitest';

import { keyMatcher } from '../../../../src/lib/server/http/auth.js';

const full = (key: string) => ({ kind: 'full' as const, key });

describe('keyMatcher', () => {
  const isKey = keyMatcher([full('current'), full('previous'), { kind: 'module', key: 'modules-key' }]);

  it.each(['current', 'previous'])('accepts %s, reaching every endpoint', key => {
    expect(isKey(key)).toBe('full');
  });

  it("says a module's key is one", () => {
    expect(isKey('modules-key')).toBe('module');
  });

  it.each([null, '', 'curren', 'current ', 'CURRENT', 'previouss', 'currént', 'module:modules-key'])(
    'refuses %j',
    key => {
      expect(isKey(key)).toBeUndefined();
    },
  );

  it('accepts a key of any length among keys of others', () => {
    expect(keyMatcher([full('a'), full('a much longer key'), full('ключ')])('ключ')).toBe('full');
  });

  it('takes the first of two keys the same, whatever their kinds', () => {
    expect(keyMatcher([{ kind: 'module', key: 'same' }, full('same')])('same')).toBe('module');
  });

  it('refuses everything when no key is accepted', () => {
    expect(keyMatcher([])('anything')).toBeUndefined();
  });
});
