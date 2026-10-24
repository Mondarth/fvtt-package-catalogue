import { describe, expect, it } from 'vitest';

import { isApiPath, isSitePath } from '../../../../src/lib/server/http/paths.js';

describe('paths', () => {
  it.each(['/api/v1', '/api/v1/status', '/api/v1/packages/module/x/releases'])('%s is the API', path => {
    expect(isApiPath(path)).toBe(true);
    expect(isSitePath(path)).toBe(false);
  });

  it.each(['/', '/about', '/api/v1beta', '/es/api/v1/status', '/api'])('%s is the website', path => {
    expect(isApiPath(path)).toBe(false);
    expect(isSitePath(path)).toBe(true);
  });

  it('the health check is neither', () => {
    expect(isApiPath('/healthz')).toBe(false);
    expect(isSitePath('/healthz')).toBe(false);
  });
});
