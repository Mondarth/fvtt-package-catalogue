import { describe, expect, it } from 'vitest';

import {
  INTERNAL_API_ROOT,
  INTERNAL_PATHS,
  entitlementRequest,
  entitlementSchema,
  tokenUserRequest,
  tokenUserResponse,
  useRequest,
} from '../src/index.js';

const USER = {
  id: 'u1',
  handle: 'amber-fox-oak-01',
  nickname: null,
  role: 'user',
  impersonated: false,
  sessionId: 's1',
} as const;

describe('the internal API', () => {
  it('is versioned in its paths', () => {
    expect(INTERNAL_API_ROOT).toBe('/internal/v1');
    expect(Object.values(INTERNAL_PATHS).every(path => path.startsWith(`${INTERNAL_API_ROOT}/`))).toBe(true);
  });

  it('asks who a token is for, and is told, or that it is no one', () => {
    expect(tokenUserRequest.parse({ token: 't' })).toEqual({ token: 't' });
    expect(tokenUserRequest.safeParse({ token: '' }).success).toBe(false);
    expect(tokenUserResponse.parse({ user: USER })).toEqual({ user: USER });
    expect(tokenUserResponse.parse({ user: null })).toEqual({ user: null });
    const sessionless = { ...USER, sessionId: undefined };
    expect(tokenUserResponse.parse({ user: sessionless }).user).not.toHaveProperty('sessionId', expect.anything());
    expect(tokenUserResponse.safeParse({ user: { ...USER, role: 'owner' } }).success).toBe(false);
  });

  it('sends an entitlement as JSON, its time read back as a date', () => {
    const entitlement = {
      paidUntil: new Date('2027-01-01T00:00:00.000Z'),
      active: true,
      patreon: false,
      entitled: true,
    };
    expect(entitlementSchema.parse(JSON.parse(JSON.stringify(entitlement)))).toEqual(entitlement);
    expect(entitlementSchema.parse({ ...entitlement, paidUntil: null })).toMatchObject({ paidUntil: null });
    expect(entitlementSchema.safeParse({ ...entitlement, paidUntil: 'soon' }).success).toBe(false);
    expect(entitlementRequest.parse({ user: USER })).toEqual({ user: USER });
  });

  it("tells of a user's use of a service", () => {
    const use = {
      kind: 'api',
      path: '/api/v2/lookup',
      client: 'EMMA-extension/0.13.1',
      ipAddress: null,
      userAgent: null,
    };
    expect(useRequest.parse({ user: USER, use })).toEqual({ user: USER, use });
    expect(useRequest.safeParse({ user: USER, use: { ...use, kind: 'session' } }).success).toBe(false);
  });
});
