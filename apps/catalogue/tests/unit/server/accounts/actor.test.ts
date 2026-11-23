import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';

import { actorOf } from '../../../../src/lib/server/accounts/actor.js';

describe('actorOf', () => {
  it('is the id of whoever is signed in, and not found for no one', () => {
    expect(actorOf({ user: { id: 'admin' } as never })).toBe('admin');
    let refused: unknown;
    try {
      actorOf({ user: null });
    } catch (error) {
      refused = error;
    }
    expect(isHttpError(refused, 404)).toBe(true);
  });
});
