import { describe, expect, it } from 'vitest';

import { ENDPOINTS } from '../../../src/lib/endpoints.js';
import { params } from '../../../src/params.js';

describe('ENDPOINTS', () => {
  it('lists each endpoint once, under the API', () => {
    const paths = ENDPOINTS.map(({ path }) => path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every(path => path.startsWith('/api/v1/'))).toBe(true);
  });
});

describe('params', () => {
  it.each(['module', 'system', 'world'])('matches the package type %s', type => {
    expect(params.packageType['~standard'].validate(type)).toEqual({ value: type });
  });

  it('does not match another word', () => {
    expect(params.packageType['~standard'].validate('theme')).toHaveProperty('issues');
  });
});
