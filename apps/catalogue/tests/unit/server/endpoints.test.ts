import { describe, expect, it } from 'vitest';

import { ENDPOINTS } from '../../../src/lib/endpoints.js';

describe('ENDPOINTS', () => {
  it('lists each endpoint once, under version 2 of the API', () => {
    const paths = ENDPOINTS.map(({ path }) => path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every(path => path.startsWith('/api/v2/'))).toBe(true);
  });
});
