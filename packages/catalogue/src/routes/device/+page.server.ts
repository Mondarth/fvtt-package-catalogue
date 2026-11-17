import { fail, redirect } from '@sveltejs/kit';

import { isDeviceClient } from '#lib/server/accounts/device.js';
import { field } from '#lib/server/form.js';

import type { Actions, PageServerLoad } from './$types';

/** What the page shows. */
export type DeviceState =
  | { readonly state: 'sign-in'; readonly providers: readonly string[]; readonly next: string }
  | { readonly state: 'impersonating' }
  | { readonly state: 'enter' }
  | { readonly state: 'confirm'; readonly code: string; readonly client: string }
  | { readonly state: 'approved' | 'denied' | 'expired' | 'unknown' | 'already' };

/** The code a device shows, as given, its spaces dropped; Better Auth reads it whatever its case and dashes. */
const codeOf = (given: string | null) => (given ?? '').replaceAll(/\s/g, '');

/**
 * Signing a device in (see `accounts/device.ts`): for a code a device shows, after signing in, which client asks, and
 * the buttons to approve or deny it. Looking at a code, signed in, makes it the user's to approve. A code expired, not
 * known, or another user's, is said to be so; one done already, too.
 */
export const load: PageServerLoad = async ({ locals, url, request }): Promise<DeviceState> => {
  if (locals.user === null) {
    return { state: 'sign-in', providers: [...locals.providers], next: `${url.pathname}${url.search}` };
  }
  if (typeof locals.session?.impersonatedBy === 'string') return { state: 'impersonating' };
  const done = url.searchParams.get('done');
  if (done === 'approved' || done === 'denied') return { state: done };
  const code = codeOf(url.searchParams.get('user_code'));
  if (code === '') return { state: 'enter' };
  const response = await locals.auth.api.deviceVerify({
    query: { user_code: code },
    headers: request.headers,
    asResponse: true,
  });
  const answer = (await response.json().catch(() => ({}))) as {
    error?: string;
    status?: string;
    client_id?: string;
  };
  if (!response.ok) return { state: answer.error === 'expired_token' ? 'expired' : 'unknown' };
  if (answer.status !== 'pending') return { state: 'already' };
  // A code another user has looked at first is theirs: Better Auth says nothing of its client to anyone else.
  if (!isDeviceClient(answer.client_id)) return { state: 'unknown' };
  return { state: 'confirm', code, client: answer.client_id };
};

/** Approves or denies the device that shows a code, and comes back to say so. */
async function decide(event: Parameters<NonNullable<Actions['approve']>>[0], approve: boolean) {
  const { locals, request } = event;
  if (locals.user === null) redirect(303, '/device');
  const userCode = codeOf(field(await request.formData(), 'code'));
  const call = approve ? locals.auth.api.deviceApprove : locals.auth.api.deviceDeny;
  const response = await call({ body: { userCode }, headers: request.headers, asResponse: true });
  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as { error?: string };
    return fail(response.status, { state: error === 'expired_token' ? ('expired' as const) : ('unknown' as const) });
  }
  redirect(303, `/device?done=${approve ? 'approved' : 'denied'}`);
}

export const actions: Actions = {
  approve: event => decide(event, true),
  deny: event => decide(event, false),
};
