import { fail, redirect } from '@sveltejs/kit';

import { checkNickname } from '#lib/server/accounts/nickname.js';

import type { Actions, PageServerLoad } from './$types';

/** Why the profile page was come back to: a deletion it could not make. */
const PROBLEMS = ['unconfirmed', 'stale'] as const;
type Problem = (typeof PROBLEMS)[number];

const isProblem = (value: string | null): value is Problem => (PROBLEMS as readonly (string | null)[]).includes(value);

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
    redirect(303, '/profile?saved');
  },
};
