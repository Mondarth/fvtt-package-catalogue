import { describe, expect, it } from 'vitest';

import { providerName } from '../../../src/lib/providers.js';

describe('providerName', () => {
  it("is a provider's own name, or its id for one the website does not know", () => {
    expect(providerName('github')).toBe('GitHub');
    expect(providerName('myspace')).toBe('myspace');
  });
});
