import { describe, expect, it } from 'vitest';

import { isApiPath, isSitePath } from '../../../../src/lib/server/http/paths.js';

describe('paths', () => {
  it.each(['/api/v1', '/api/v1/status', '/api/v1/packages/module/x/releases', '/api/v2/lookup', '/api', '/api/v1beta'])(
    '%s is the API',
    path => {
      expect(isApiPath(path)).toBe(true);
      expect(isSitePath(path)).toBe(false);
    },
  );

  it.each(['/', '/about', '/apis', '/es/api/v1/status'])('%s is the website', path => {
    expect(isApiPath(path)).toBe(false);
    expect(isSitePath(path)).toBe(true);
  });

  it('the health check is neither', () => {
    expect(isApiPath('/healthz')).toBe(false);
    expect(isSitePath('/healthz')).toBe(false);
  });
});
