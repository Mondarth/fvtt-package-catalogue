/**
 * The services a subscription gives access to, as a tree, which the admins add to: one under another, from its menu, or one at the top. Access to one gives access to every one under it (see `subscriptions/services.ts`).
 */
import { fail, redirect } from '@sveltejs/kit';

import { actorOf } from '#lib/server/accounts/actor.js';
import { field } from '#lib/server/form.js';
import { SERVICE_ID, SERVICE_ID_MAX, SERVICE_NAME_MAX, serviceIdOf } from '#lib/server/subscriptions/services.js';

import type { Actions, PageServerLoad } from './$types';

/** The longest a description may be. */
const DESCRIPTION_MAX = 500;

export const load: PageServerLoad = async ({ locals, url }) => ({
  services: await locals.subscriptions.services(),
  // The one just added, to select.
  added: url.searchParams.get('added'),
});

export const actions: Actions = {
  /**
   * Adds a service: under the one whose menu it was added from, or at the top. Its id is the one given, or else
   * made from its name; never changed once made, as the applications ask for it by it.
   */
  add: async ({ locals, request }) => {
    const admin = actorOf(locals);
    const form = await request.formData();
    const parent = field(form, 'parent');
    const name = field(form, 'name');
    const description = field(form, 'description');
    const id = field(form, 'id') || serviceIdOf(name);
    const given = { parent, name, id: field(form, 'id'), description };
    if (name === '' || name.length > SERVICE_NAME_MAX) return fail(400, { ...given, problem: 'name' as const });
    if (!SERVICE_ID.test(id) || id.length > SERVICE_ID_MAX) {
      return fail(400, { ...given, problem: 'id' as const });
    }
    if (description.length > DESCRIPTION_MAX) return fail(400, { ...given, problem: 'description' as const });
    const added = await locals.subscriptions.addService({
      id,
      name,
      description: description === '' ? null : description,
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
