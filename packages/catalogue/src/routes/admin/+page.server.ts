import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

/** The admin pages start at the list of users. */
export const load: PageServerLoad = () => redirect(303, '/admin/users');
