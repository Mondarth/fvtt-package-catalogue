import { error, fail, redirect } from '@sveltejs/kit';

import { BAN_DAYS_MAX, BAN_REASON_MAX } from '#lib/admin.js';
import { actorOf } from '#lib/server/accounts/actor.js';
import { refusalOf } from '#lib/server/accounts/admin-hooks.js';
import { dayOf, field, periodOf } from '#lib/server/form.js';
import { isRole } from '#lib/server/accounts/permissions.js';
import { isPeriod } from '#lib/server/subscriptions/period.js';

import type { Actions, PageServerLoad } from './$types';

/** How many of the audit log's entries about the user the page shows. */
const AUDIT_SHOWN = 20;

/** A user's admin page: what is held of them, what admins did about them, and what an admin may do. */
export const load: PageServerLoad = async ({ locals, params, url }) => {
  const user = await locals.accounts.userDetail(params.id);
  if (user === undefined) error(404);
  const configured = locals.adminUserIds.includes(user.id);
  const [subscription, credits] = await Promise.all([
    locals.subscriptions.status(user.id),
    locals.subscriptions.history(user.id),
  ]);
  return {
    subscription,
    credits,
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

/** The longest an admin's note on a subscription may be. */
const NOTE_MAX = 200;

/** A change to the user's subscription, recorded with how it was and is, and the page come back to. */
async function subscriptionChanged(
  locals: App.Locals,
  userId: string,
  action: 'subscription.grant' | 'subscription.set-end' | 'subscription.revoke',
  before: Date | null,
  after: Date | null,
  note: string | null,
  done: string,
): Promise<never> {
  await locals.audit.record({
    actorId: actorOf(locals),
    action,
    subjectId: userId,
    before: { paidUntil: before?.toISOString() ?? null },
    after: { paidUntil: after?.toISOString() ?? null, ...(note !== null && { note }) },
    requestId: locals.requestId,
  });
  redirect(303, `/admin/users/${encodeURIComponent(userId)}?done=${done}`);
}

export const actions: Actions = {
  /** Grants the user so many months and days, after what they have: added to their subscription's end, or from now. */
  grant: async ({ locals, params, request }) => {
    const form = await request.formData();
    const period = periodOf(form);
    const note = field(form, 'note') || null;
    if (!isPeriod(period)) return fail(400, { action: 'grant', refusal: null, problem: 'period' as const });
    if (note !== null && note.length > NOTE_MAX) {
      return fail(400, { action: 'grant', refusal: null, problem: 'note' as const });
    }
    if ((await locals.accounts.userDetail(params.id)) === undefined) error(404);
    const before = (await locals.subscriptions.status(params.id)).paidUntil;
    const credited = await locals.subscriptions.credit({
      userId: params.id,
      source: 'grant',
      ...period,
      grantedBy: actorOf(locals),
      note,
    });
    // A grant has no provider's reference, so is never one credited already.
    /* v8 ignore next */
    const after = credited === 'duplicate' ? before : credited.endsAt;
    return subscriptionChanged(locals, params.id, 'subscription.grant', before, after, note, 'grant');
  },

  /** Sets the day the user's subscription ends, at its start in UTC: later adds time, earlier cuts it back. */
  setEnd: async ({ locals, params, request }) => {
    const form = await request.formData();
    const end = dayOf(field(form, 'end'));
    const note = field(form, 'note') || null;
    if (end === null) {
      return fail(400, { action: 'setEnd', refusal: null, problem: 'date' as const });
    }
    if ((await locals.accounts.userDetail(params.id)) === undefined) error(404);
    const { before, after } = await locals.subscriptions.setEnd(params.id, end, actorOf(locals), note);
    return subscriptionChanged(locals, params.id, 'subscription.set-end', before, after, note, 'setEnd');
  },

  /** Ends the user's subscription now. */
  revoke: async ({ locals, params }) => {
    if ((await locals.accounts.userDetail(params.id)) === undefined) error(404);
    const { before, after } = await locals.subscriptions.setEnd(params.id, new Date(), actorOf(locals), null);
    return subscriptionChanged(locals, params.id, 'subscription.revoke', before, after, null, 'revoke');
  },

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
    const reason = field(form, 'reason');
    const given = field(form, 'days');
    const days = /^\d+$/.test(given) ? Number(given) : Number.NaN;
    if (reason.length > BAN_REASON_MAX) return fail(400, { action: 'ban', refusal: null, problem: 'reason' as const });
    // Whole days, from one to ten years; none is a ban until lifted.
    if (given !== '' && !(days >= 1 && days <= BAN_DAYS_MAX)) {
      return fail(400, { action: 'ban', refusal: null, problem: 'banDays' as const });
    }
    const response = await locals.auth.api.banUser({
      body: {
        userId: params.id,
        ...(reason !== '' && { banReason: reason }),
        ...(given !== '' && { banExpiresIn: days * 24 * 60 * 60 }),
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
