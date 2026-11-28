/**
 * The services a subscription gives access to, as a tree, which the admins add to: one under another, from its menu,
 * or one at the top. Access to one gives access to every one under it (see `subscriptions/services.ts`).
 */
import { fail, redirect } from '@sveltejs/kit';

import { actorOf } from '#lib/server/accounts/actor.js';
import { field } from '#lib/server/form.js';
import { SERVICE_DESCRIPTION_MAX, SERVICE_ID, SERVICE_ID_MAX, SERVICE_NAME_MAX } from '#lib/service-id.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => ({
  services: await locals.subscriptions.services(),
  // The one just added, to select.
  added: url.searchParams.get('added'),
});

export const actions: Actions = {
  /**
   * Adds a service: under the one whose menu it was added from, or at the top. Its name, id and description are each
   * required; the form fills in the id from the name, and it is never changed once made, as the applications ask for
   * it by it.
   */
  add: async ({ locals, request }) => {
    const admin = actorOf(locals);
    const form = await request.formData();
    const parent = field(form, 'parent');
    const name = field(form, 'name');
    const description = field(form, 'description');
    const id = field(form, 'id');
    const given = { parent, name, id, description };
    if (name === '' || name.length > SERVICE_NAME_MAX) return fail(400, { ...given, problem: 'name' as const });
    if (!SERVICE_ID.test(id) || id.length > SERVICE_ID_MAX) {
      return fail(400, { ...given, problem: 'id' as const });
    }
    if (description === '' || description.length > SERVICE_DESCRIPTION_MAX) {
      return fail(400, { ...given, problem: 'description' as const });
    }
    const added = await locals.subscriptions.addService({
      id,
      name,
      description,
      parentId: parent === '' ? null : parent,
      createdBy: admin,
    });
    if (added === 'taken' || added === 'no-parent') return fail(400, { ...given, problem: added });
    await locals.audit.record({
      actorId: admin,
      action: 'service.add',
      after: { service: added.id, name: added.name, parent: added.parentId },
      requestId: locals.requestId,
    });
    redirect(303, `/admin/services?added=${encodeURIComponent(added.id)}`);
  },
};
