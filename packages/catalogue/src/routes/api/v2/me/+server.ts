import { MeResponse } from '@mondarth/fvtt-package-catalogue-contract';

import { endpoint } from '#lib/server/http/endpoint.js';
import { apiError, respond } from '#lib/server/http/respond.js';

import type { RequestHandler } from './$types';

/**
 * Who a user's token is for, and whether they may use the API: answered whether or not they are subscribed, so that a
 * client can tell them, such as to renew. The `handle` hook lets only a user's token through (see `http/access.ts`).
 */
export const GET: RequestHandler = endpoint(({ locals }) => {
  const { caller } = locals;
  if (caller?.kind !== 'user') {
    return Promise.resolve(apiError('forbidden', 'A user’s token is needed', locals.requestId));
  }
  const { user, entitlement } = caller;
  return Promise.resolve(
    respond(MeResponse, {
      user: { handle: user.handle, nickname: user.nickname, role: user.role },
      subscription: {
        paidUntil: entitlement.paidUntil?.toISOString() ?? null,
        active: entitlement.active || entitlement.patreon,
        patreon: entitlement.patreon,
      },
      entitled: entitlement.entitled,
    }),
  );
});
