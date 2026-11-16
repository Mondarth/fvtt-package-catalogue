import { error, fail, redirect } from '@sveltejs/kit';

import { BAN_REASON_MAX } from '#lib/admin.js';
import { refusalOf } from '#lib/server/accounts/admin-hooks.js';
import { isRole } from '#lib/server/accounts/permissions.js';

import type { Actions, PageServerLoad } from './$types';

/** How many of the audit log's entries about the user the page shows. */
const AUDIT_SHOWN = 20;

/** A user's admin page: what is held of them, what admins did about them, and what an admin may do. */
export const load: PageServerLoad = async ({ locals, params, url }) => {
  const user = await locals.accounts.userDetail(params.id);
  if (user === undefined) error(404);
  const configured = locals.adminUserIds.includes(user.id);
  return {
    user: {
      ...user,
      providers: user.providers.map(({ providerId }) => providerId),
      admin: configured || user.role === 'admin',
      configured,
      self: user.id === locals.user?.id,
    },
    audit: await locals.audit.recent({ limit: AUDIT_SHOWN, userId: user.id }),
    done: url.searchParams.get('done'),
    refused: url.searchParams.get('refused'),
  };
};

/**
 * What Better Auth answered an admin endpoint with, as the page's form result: done, or why not.
 *
 * @param response - Its answer
 * @param action - Which action
 * @param userId - The user
 * @returns A redirect back to the page when done; else the failure
 */
async function outcome(response: Response, action: string, userId: string) {
  if (response.ok) redirect(303, `/admin/users/${encodeURIComponent(userId)}?done=${action}`);
  const { code } = (await response.json().catch(() => ({}))) as { code?: string };
  return fail(response.status, { action, refusal: refusalOf(code) ?? null });
}

export const actions: Actions = {
  /** Gives the user a role. */
  role: async ({ locals, params, request }) => {
    const role = (await request.formData()).get('role');
    if (!isRole(role)) return fail(400, { action: 'role', refusal: 'role' as const });
    const response = await locals.auth.api.setRole({
      body: { userId: params.id, role },
      headers: request.headers,
      asResponse: true,
    });
    return outcome(response, 'role', params.id);
  },

  /** Stops the user signing in, signing them out: for good, or for so many days. */
  ban: async ({ locals, params, request }) => {
    const form = await request.formData();
    const given = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    const reason = given('reason');
    const days = Number.parseInt(given('days'), 10);
    if (reason.length > BAN_REASON_MAX) return fail(400, { action: 'ban', refusal: null, reasonTooLong: true });
    const response = await locals.auth.api.banUser({
      body: {
        userId: params.id,
        ...(reason !== '' && { banReason: reason }),
        ...(Number.isInteger(days) && days > 0 && { banExpiresIn: days * 24 * 60 * 60 }),
      },
      headers: request.headers,
      asResponse: true,
    });
    return outcome(response, 'ban', params.id);
  },

  /** Lets the user sign in again. */
  unban: async ({ locals, params, request }) => {
    const response = await locals.auth.api.unbanUser({
      body: { userId: params.id },
      headers: request.headers,
      asResponse: true,
    });
    return outcome(response, 'unban', params.id);
  },

  /** Signs the user out of every browser. */
  signOut: async ({ locals, params, request }) => {
    const response = await locals.auth.api.revokeUserSessions({
      body: { userId: params.id },
      headers: request.headers,
      asResponse: true,
    });
    return outcome(response, 'signOut', params.id);
  },
};
