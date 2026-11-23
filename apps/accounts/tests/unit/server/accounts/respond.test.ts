import { describe, expect, it } from 'vitest';

import { redirectWithCookies } from '../../../../src/lib/server/accounts/respond.js';

describe('redirectWithCookies', () => {
  it('is a 303 that sets every cookie the other response set, and nothing else of it', () => {
    const from = new Headers({ 'Content-Type': 'application/json' });
    from.append('Set-Cookie', 'a=1');
    from.append('Set-Cookie', 'b=2');
    const response = redirectWithCookies('/there', from);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/there');
    expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
    expect(response.headers.get('Content-Type')).toBeNull();
  });
});
