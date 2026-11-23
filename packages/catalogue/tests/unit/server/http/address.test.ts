import { describe, expect, it } from 'vitest';

import { addressOf } from '../../../../src/lib/server/http/address.js';

describe("a request's address", () => {
  it('is what the adapter says, or none where it knows none', () => {
    expect(addressOf({ getClientAddress: () => '203.0.113.7' })).toBe('203.0.113.7');
    expect(
      addressOf({
        getClientAddress: () => {
          throw new Error('No address');
        },
      }),
    ).toBeNull();
  });
});
