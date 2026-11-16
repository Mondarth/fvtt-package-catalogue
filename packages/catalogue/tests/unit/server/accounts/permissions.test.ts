import { describe, expect, it } from 'vitest';

import { isAdmin, isRole, roles, ROLES } from '../../../../src/lib/server/accounts/permissions.js';

describe('the roles', () => {
  it('are a user and an admin', () => {
    expect(ROLES).toEqual(['user', 'admin']);
    expect(isRole('admin')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it('let an admin manage users and read the audit log, but not view the site as another admin', () => {
    expect(roles.admin.authorize({ user: ['list', 'get', 'set-role', 'ban', 'impersonate'] }).success).toBe(true);
    expect(roles.admin.authorize({ session: ['list', 'revoke'], audit: ['list'] }).success).toBe(true);
    expect(roles.admin.authorize({ user: ['impersonate-admins'] }).success).toBe(false);
  });

  it('let a user do none of it', () => {
    expect(roles.user.authorize({ user: ['list'] }).success).toBe(false);
    expect(roles.user.authorize({ audit: ['list'] }).success).toBe(false);
  });
});

describe('isAdmin', () => {
  it('is an admin by role, or by being named, whatever the role', () => {
    expect(isAdmin({ id: 'a', role: 'admin' }, [])).toBe(true);
    expect(isAdmin({ id: 'a', role: 'user,admin' }, [])).toBe(true);
    expect(isAdmin({ id: 'a', role: 'user' }, ['a'])).toBe(true);
    expect(isAdmin({ id: 'a', role: null }, ['b'])).toBe(false);
    expect(isAdmin({ id: 'a' }, [])).toBe(false);
  });
});
