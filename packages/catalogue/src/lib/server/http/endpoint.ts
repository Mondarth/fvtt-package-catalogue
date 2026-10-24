/**
 * The API's endpoints. An endpoint that throws answers with the contract's `internal` error, not SvelteKit's error
 * page, and the error is logged with the request's id.
 */
import type { RequestEvent } from '@sveltejs/kit';

import { apiError } from './respond.js';

/**
 * Wraps an API endpoint so that it always answers in the contract's shape.
 *
 * @param handler - The endpoint
 * @returns The endpoint, answering `internal` if it throws
 */
export function endpoint<E extends RequestEvent>(
  handler: (event: E) => Promise<Response>,
): (event: E) => Promise<Response> {
  return async event => {
    try {
      return await handler(event);
    } catch (error) {
      event.locals.log.error('The endpoint failed', { error });
      return apiError('internal', 'Something went wrong in the catalogue', event.locals.requestId);
    }
  };
}
