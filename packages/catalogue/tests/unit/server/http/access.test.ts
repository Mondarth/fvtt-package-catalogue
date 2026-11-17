import { describe, expect, it } from 'vitest';

import { bearerToken, keyReaches, MODULE_PATHS } from '../../../../src/lib/server/http/access.js';

describe('keyReaches', () => {
  it("lets a module's key call lookups, the listing, the builds and manifests, and nothing else", () => {
    expect([...MODULE_PATHS].sort()).toEqual(['/api/v2/core', '/api/v2/listing', '/api/v2/lookup', '/api/v2/manifest']);
    for (const path of MODULE_PATHS) expect(keyReaches('module', path)).toBe(true);
    for (const path of ['/api/v2/recheck', '/api/v2/status', '/api/v2/me', '/api/v9/lookup']) {
      expect(keyReaches('module', path)).toBe(false);
    }
  });

  it('lets a key alone call every endpoint but /me', () => {
    expect(keyReaches('full', '/api/v2/recheck')).toBe(true);
    expect(keyReaches('full', '/api/v9/anything')).toBe(true);
    expect(keyReaches('full', '/api/v2/me')).toBe(false);
  });
});

describe('bearerToken', () => {
  it('reads the token of the bearer scheme, whatever its case', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer   abc  ')).toBe('abc');
  });

  it.each([null, '', 'Bearer', 'Bearer ', 'Basic abc', 'Bearer a b'])('is none for %j', header => {
    expect(bearerToken(header)).toBeUndefined();
  });
});

describe('the endpoints the website lists', () => {
  it('say who may call each, as the server holds it', async () => {
    const { ENDPOINTS } = await import('../../../../src/lib/endpoints.js');
    for (const { path, callers } of ENDPOINTS) {
      expect(keyReaches('module', path), path).toBe(callers === 'module');
      expect(keyReaches('full', path), path).toBe(callers !== 'user');
    }
  });
});
