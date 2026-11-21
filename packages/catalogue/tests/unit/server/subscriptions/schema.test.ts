import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { users } from '../../../../src/lib/server/accounts/schema.js';
import {
  patreonMemberships,
  subscriptionCredits,
  subscriptionOffers,
} from '../../../../src/lib/server/subscriptions/schema.js';
import { codeOf, isUniqueViolation } from '../../../../src/lib/server/db/errors.js';

describe("a subscription's credits", () => {
  it('go with their user, and keep the offer they were bought by', () => {
    const keys = getTableConfig(subscriptionCredits).foreignKeys.map(key => {
      const { foreignTable, foreignColumns } = key.reference();
      return { to: getTableConfig(foreignTable).name, column: foreignColumns[0]?.name, onDelete: key.onDelete };
    });
    expect(keys).toEqual([
      { to: getTableConfig(users).name, column: 'id', onDelete: 'cascade' },
      { to: getTableConfig(subscriptionOffers).name, column: 'id', onDelete: 'no action' },
    ]);
  });
});

describe("a user's Patreon membership", () => {
  it('goes with its user', () => {
    const keys = getTableConfig(patreonMemberships).foreignKeys.map(key => {
      const { foreignTable, foreignColumns } = key.reference();
      return { to: getTableConfig(foreignTable).name, column: foreignColumns[0]?.name, onDelete: key.onDelete };
    });
    expect(keys).toEqual([{ to: getTableConfig(users).name, column: 'id', onDelete: 'cascade' }]);
  });
});

describe("a database error's code", () => {
  it('is read wherever the driver puts it', () => {
    expect(codeOf({ code: '23505' })).toBe('23505');
    expect(codeOf({ cause: { cause: { code: '23503' } } })).toBe('23503');
    expect(codeOf({ code: undefined, cause: { code: '1' } })).toBe('1');
    expect(codeOf('text')).toBeUndefined();
    expect(codeOf(null)).toBeUndefined();
    expect(codeOf({})).toBeUndefined();
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation(new Error('other'))).toBe(false);
  });
});
