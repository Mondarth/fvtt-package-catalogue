import { fail, redirect } from '@sveltejs/kit';

import { checkNickname } from '#lib/server/accounts/nickname.js';
import { field } from '#lib/server/form.js';
import { deletionBlockOf } from '#lib/server/subscriptions/deletion.js';
import { describeAgent } from '#lib/user-agent.js';

import type { Actions, PageServerLoad } from './$types';

/** Why the profile page was come back to: a deletion it could not make. */
const PROBLEMS = ['unconfirmed', 'stale', 'impersonating', 'dispute', 'refund'] as const;
type Problem = (typeof PROBLEMS)[number];

const isProblem = (value: string | null): value is Problem => (PROBLEMS as readonly (string | null)[]).includes(value);

/** A session, as the list of signed-in devices shows it: never its token. */
export interface Device {
  readonly id: string;
  /** What signed in: the website, a client by its id, or an admin viewing the site as the user. */
  readonly kind: string;
  readonly current: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly agent: string | null;
}

/**
 * The user's sessions, the current first, then the newest, read from the accounts' tables: Better Auth's own listing
 * asks for a session signed in within the day, which looking at one's own devices should not.
 */
async function devicesOf(locals: App.Locals, userId: string): Promise<Device[]> {
  const sessions = await locals.accounts.sessionsOf(userId);
  return sessions
    .map(session => ({
      id: session.id,
      kind: session.impersonatedBy !== null ? 'impersonation' : (session.clientId ?? 'website'),
      current: session.id === locals.session?.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      agent: describeAgent(session.userAgent),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt.getTime() - a.createdAt.getTime());
}

/** The signed-in user's profile, and what is stored about them; the sign-in page for anyone else. */
export const load: PageServerLoad = async ({ locals, url }) => {
  const { user } = locals;
  if (user === null) redirect(303, '/');
  const problem = url.searchParams.get('problem');
  return {
    profile: {
      handle: user.handle,
      nickname: user.nickname ?? null,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      providers: (await locals.accounts.linkedProviders(user.id)).map(({ providerId }) => providerId),
    },
    problem: isProblem(problem) ? problem : null,
    saved: url.searchParams.has('saved'),
    devices: await devicesOf(locals, user.id),
    signedOut: url.searchParams.get('signed-out'),
    // An admin viewing the site as the user may not sign their devices out; Better Auth's hooks refuse it too.
    impersonated: typeof locals.session?.impersonatedBy === 'string',
    // Why the profile may not be deleted now, if it may not: a refund still to be made, or a payment disputed.
    deletionBlock: deletionBlockOf(await locals.subscriptions.history(user.id)),
  };
};

export const actions: Actions = {
  /**
   * Sets the nickname, or clears it when none is given, then comes back to the page afresh, so that every part of it,
   * the bar along the top among them, shows the name as it now is.
   */
  nickname: async ({ locals, request }) => {
    const { user } = locals;
    if (user === null) redirect(303, '/');
    const field = (await request.formData()).get('nickname');
    const given = typeof field === 'string' ? field : '';
    const checked = checkNickname(given);
    if (!checked.ok) return fail(400, { given, problem: checked.problem });
    if ((await locals.accounts.setNickname(user.id, checked.nickname)) === 'taken') {
      return fail(400, { given, problem: 'taken' as const });
    }
    // Done by the admin viewing the site as them: recorded as theirs, done as the user.
    const admin = locals.session?.impersonatedBy;
    if (typeof admin === 'string') {
      await locals.audit.record({
        actorId: admin,
        asUserId: user.id,
        action: 'profile.nickname',
        subjectId: user.id,
        before: { nickname: user.nickname ?? null },
        after: { nickname: checked.nickname },
        requestId: locals.requestId,
      });
    }
    redirect(303, '/profile?saved');
  },

  /**
   * Signs one of the user's sessions out, by its id, ending it at once: theirs alone. Better Auth's own revoking asks
   * for a session signed in within the day, which would have someone who fears a session stolen sign in again first.
   * An admin viewing the site as the user may not.
   */
  signOut: async ({ locals, request }) => {
    const { user } = locals;
    if (user === null) redirect(303, '/');
    if (typeof locals.session?.impersonatedBy === 'string') return fail(403, { devices: 'refused' as const });
    const id = field(await request.formData(), 'session');
    if (id === locals.session?.id || (await locals.accounts.endSessions(user.id, { only: id })) === 0) {
      return fail(404, { devices: 'refused' as const });
    }
    redirect(303, '/profile?signed-out=one');
  },

  /** Signs every session out but this one. */
  signOutOthers: async ({ locals }) => {
    const { user, session } = locals;
    if (user === null || session === null) redirect(303, '/');
    if (typeof session.impersonatedBy === 'string') return fail(403, { devices: 'refused' as const });
    await locals.accounts.endSessions(user.id, { except: session.id });
    redirect(303, '/profile?signed-out=others');
  },
};
