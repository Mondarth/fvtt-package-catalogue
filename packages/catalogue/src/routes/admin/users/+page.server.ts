import { USERS_PER_PAGE } from '#lib/admin.js';

import type { PageServerLoad } from './$types';

/** The users, the newest first, those a search finds in their handle, nickname, name or email. */
export const load: PageServerLoad = async ({ locals, url }) => {
  const search = url.searchParams.get('q')?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const { users, total } = await locals.accounts.listUsers({
    search,
    limit: USERS_PER_PAGE,
    offset: (page - 1) * USERS_PER_PAGE,
  });
  return {
    search,
    page,
    pages: Math.max(1, Math.ceil(total / USERS_PER_PAGE)),
    total,
    users: users.map(user => ({
      ...user,
      admin: locals.adminUserIds.includes(user.id) || user.role === 'admin',
    })),
  };
};
