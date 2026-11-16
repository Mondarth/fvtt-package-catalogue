/**
 * Who may do what on the website: each role's permissions, through Better Auth's access control, which its admin
 * plugin checks for its own endpoints, and the website's routes check for theirs (see {@link isAdmin}).
 *
 * - `user`, every profile's role: what is their own, which needs no permission here.
 * - `admin`: listing and looking at users, setting their roles, banning them, viewing the site as them
 *   (impersonating) and signing them out, and reading the audit log. Not impersonating another admin.
 *
 * The admins named in `ADMIN_USER_IDS` are admins whatever their role says: Better Auth grants them every permission,
 * so what is refused even them, such as impersonating an admin, is refused by the hooks (see `admin-hooks.ts`).
 */
import { createAccessControl } from 'better-auth/plugins/access';

/** Every permission there is, by what it is on. */
export const STATEMENTS = {
  user: ['list', 'get', 'set-role', 'ban', 'impersonate', 'impersonate-admins'],
  session: ['list', 'revoke'],
  audit: ['list'],
} as const;

export const ac = createAccessControl(STATEMENTS);

/** The roles, and what each may do. */
export const roles = {
  user: ac.newRole({}),
  admin: ac.newRole({
    user: ['list', 'get', 'set-role', 'ban', 'impersonate'],
    session: ['list', 'revoke'],
    audit: ['list'],
  }),
};

/** A role a user may be given. */
export type Role = keyof typeof roles;

/** The roles, in the order the admin pages offer them. */
export const ROLES = ['user', 'admin'] as const satisfies readonly Role[];

/**
 * Whether a value is a role.
 *
 * @param value - The value
 * @returns `true` if it is one of {@link ROLES}
 */
export const isRole = (value: unknown): value is Role => (ROLES as readonly unknown[]).includes(value);

/** A user, as far as their role goes. */
export interface WithRole {
  readonly id: string;
  readonly role?: string | null | undefined;
}

/**
 * Whether a user is an admin: by their role, or by being named in `ADMIN_USER_IDS`.
 *
 * @param user - The user
 * @param adminUserIds - The ids `ADMIN_USER_IDS` names
 * @returns `true` if they are
 */
export function isAdmin(user: WithRole, adminUserIds: readonly string[]): boolean {
  return adminUserIds.includes(user.id) || (user.role ?? 'user').split(',').includes('admin');
}
