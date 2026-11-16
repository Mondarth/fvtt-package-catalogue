/**
 * Better Auth's hooks for its admin endpoints: what is refused even an admin, and the audit log of what admins did.
 * Hooks run for every call of an endpoint, the admin pages' and anyone's straight to `/auth/admin/…` alike, so these
 * hold however the endpoint is reached.
 *
 * Refused:
 * - while viewing the site as someone (impersonating): anything an admin does, deleting the profile, and linking or
 *   unlinking its providers, all but stopping;
 * - an admin's role changed, banning or signing out by themselves;
 * - the role or ban of an admin named in `ADMIN_USER_IDS`, which only the deployment changes;
 * - viewing the site as another admin, even for those `ADMIN_USER_IDS` names, whom Better Auth would let;
 * - a role that is not one of `permissions.ts`'s.
 *
 * Recorded, once the endpoint succeeded: setting a role, banning, unbanning, impersonating, stopping, and signing
 * someone out everywhere.
 */
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';

import { eq } from 'drizzle-orm';

import { isAdmin, isRole } from './permissions.js';
import { users } from './schema.js';

import type { AuditAction, AuditStore } from './audit.js';
import type { Database } from '../db/database.js';

/** Better Auth's admin endpoints the website does not offer: turned off (see `auth.ts`). */
export const DISABLED_ADMIN_PATHS = [
  '/admin/create-user',
  '/admin/set-user-password',
  '/admin/update-user',
  '/admin/remove-user',
  '/admin/revoke-user-session',
];

/** The admin endpoints recorded, and what each is recorded as. */
const AUDITED: Readonly<Record<string, AuditAction>> = {
  '/admin/set-role': 'user.set-role',
  '/admin/ban-user': 'user.ban',
  '/admin/unban-user': 'user.unban',
  '/admin/impersonate-user': 'user.impersonate',
  '/admin/stop-impersonating': 'user.stop-impersonating',
  '/admin/revoke-user-sessions': 'user.revoke-sessions',
};

/** Endpoints refused while viewing the site as someone. */
const REFUSED_WHILE_IMPERSONATING = new Set([
  '/delete-user',
  '/link-social',
  '/unlink-account',
  '/oauth2/link',
  ...Object.keys(AUDITED).filter(path => path !== '/admin/stop-impersonating'),
]);

/** Endpoints that act on another user, named by `body.userId`, which an admin may not turn on themselves. */
const ON_ANOTHER = new Set([
  '/admin/set-role',
  '/admin/ban-user',
  '/admin/impersonate-user',
  '/admin/revoke-user-sessions',
]);

/** Endpoints that change what `ADMIN_USER_IDS` sets. */
const ON_CONFIGURED = new Set(['/admin/set-role', '/admin/ban-user', '/admin/unban-user']);

/** What the hooks work with. */
export interface AdminHooksOptions {
  readonly db: Database;
  readonly audit: AuditStore;
  /** The ids `ADMIN_USER_IDS` names. */
  readonly adminUserIds: readonly string[];
}

/** A user, as far as the hooks look. */
type Target = Pick<typeof users.$inferSelect, 'id' | 'role' | 'banned' | 'banReason' | 'banExpires'>;

/** What the before hook found, for the after hook to record. */
interface Pending {
  readonly action: AuditAction;
  readonly actorId: string;
  readonly subjectId: string;
  readonly before: Record<string, unknown> | null;
}

/** Why the hooks refused, as the admin pages name it, in the error's `code`. */
export const REFUSALS = {
  impersonating: 'Not while viewing the site as someone: stop first',
  self: 'Not on yourself',
  configured: 'An admin named in ADMIN_USER_IDS is changed only by the deployment',
  admin: 'Not as another admin',
  role: 'Not a role',
} as const;
export type Refusal = keyof typeof REFUSALS;

const refuse = (why: Refusal) =>
  new APIError('FORBIDDEN', { message: REFUSALS[why], code: `REFUSED_${why.toUpperCase()}` });

/**
 * Why the hooks refused, from an error's code.
 *
 * @param code - The code Better Auth answered with
 * @returns The refusal, or none if it was not the hooks'
 */
export function refusalOf(code: unknown): Refusal | undefined {
  if (typeof code !== 'string' || !code.startsWith('REFUSED_')) return undefined;
  const why = code.slice('REFUSED_'.length).toLowerCase();
  return why in REFUSALS ? (why as Refusal) : undefined;
}

/** The ban a user has, for the record. */
const banOf = (user: Target) => ({
  banned: user.banned === true,
  reason: user.banReason ?? null,
  expires: user.banExpires?.toISOString() ?? null,
});

/**
 * The hooks.
 *
 * @param options - The database, the audit log and the admins `ADMIN_USER_IDS` names
 * @returns Better Auth's `hooks` option
 */
export function adminHooks({ db, audit, adminUserIds }: AdminHooksOptions) {
  // What each call found before it ran, by its context, which the call's hooks share.
  const pending = new WeakMap<object, Pending>();

  async function find(id: string): Promise<Target | undefined> {
    const [found] = await db
      .select({
        id: users.id,
        role: users.role,
        banned: users.banned,
        banReason: users.banReason,
        banExpires: users.banExpires,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return found;
  }

  const before = createAuthMiddleware(async ctx => {
    const { path } = ctx;
    const action = AUDITED[path];
    if (action === undefined && !REFUSED_WHILE_IMPERSONATING.has(path)) return;
    const session = await getSessionFromCtx(ctx);
    if (session === null) return;
    const impersonating = typeof session.session.impersonatedBy === 'string';
    if (impersonating && REFUSED_WHILE_IMPERSONATING.has(path)) {
      throw refuse('impersonating');
    }
    if (action === undefined) return;

    if (path === '/admin/stop-impersonating') {
      if (!impersonating) return;
      pending.set(ctx.context, {
        action,
        actorId: session.session.impersonatedBy as string,
        subjectId: session.user.id,
        before: null,
      });
      return;
    }

    const body = (ctx.body ?? {}) as { userId?: unknown; role?: unknown };
    const subjectId = typeof body.userId === 'string' ? body.userId : null;
    const target = subjectId === null ? undefined : await find(subjectId);
    // Better Auth answers for a user it cannot find, or a caller who may not: nothing is changed to record.
    if (target === undefined) return;
    if (ON_ANOTHER.has(path) && target.id === session.user.id) throw refuse('self');
    if (ON_CONFIGURED.has(path) && adminUserIds.includes(target.id)) {
      throw refuse('configured');
    }
    if (path === '/admin/impersonate-user' && isAdmin(target, adminUserIds)) {
      throw refuse('admin');
    }
    if (path === '/admin/set-role' && !isRole(body.role)) throw refuse('role');

    const was =
      path === '/admin/set-role'
        ? { role: target.role ?? 'user' }
        : path === '/admin/unban-user' || path === '/admin/ban-user'
          ? banOf(target)
          : null;
    pending.set(ctx.context, { action, actorId: session.user.id, subjectId: target.id, before: was });
  });

  const after = createAuthMiddleware(async ctx => {
    const found = pending.get(ctx.context);
    if (found === undefined) return;
    pending.delete(ctx.context);
    if (isAPIError(ctx.context.returned)) return;
    const now = await find(found.subjectId);
    // The user was found before the call, and Better Auth's admin endpoints remove no one.
    /* v8 ignore next */
    if (now === undefined) return audit.record({ ...found, after: null });
    const changed =
      found.action === 'user.set-role'
        ? { role: now.role }
        : found.action === 'user.ban' || found.action === 'user.unban'
          ? banOf(now)
          : null;
    await audit.record({ ...found, after: changed });
  });

  return { before, after };
}
