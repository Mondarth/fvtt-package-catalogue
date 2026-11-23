/**
 * Responses of the API. Every body is checked against the contract before it is sent, so the API cannot send what its
 * clients would reject.
 */
import { ErrorResponse, type ErrorCode } from '@mondarth/fvtt-package-catalogue-contract';
import type { z } from 'zod';

const STATUS: Record<ErrorCode, number> = {
  'bad-request': 400,
  unauthorised: 401,
  forbidden: 403,
  'subscription-required': 403,
  'not-found': 404,
  'method-not-allowed': 405,
  'rate-limited': 429,
  unavailable: 503,
  internal: 500,
};

/**
 * A JSON response whose body the contract's schema accepts.
 *
 * @param schema - The contract's schema of the body
 * @param body - The body
 * @param init - The status and headers
 * @returns The response
 * @throws {z.ZodError} If the body breaks the contract: a bug in the catalogue
 */
export function respond<S extends z.ZodType>(schema: S, body: z.input<S>, init: ResponseInit = {}): Response {
  return Response.json(schema.parse(body), init);
}

/**
 * An error response, in the contract's shape.
 *
 * @param code - Why the request failed
 * @param message - What went wrong, for the client's developer
 * @param requestId - Identifies the request in the logs
 * @param more - What else the error says, such as when a subscription ended
 * @param more.paidUntil - For `subscription-required`: when it ended, or null if there never was one
 * @returns The response, with the status the code means
 */
export function apiError(
  code: ErrorCode,
  message: string,
  requestId?: string,
  more: { readonly paidUntil?: Date | null } = {},
): Response {
  return respond(
    ErrorResponse,
    {
      error: {
        code,
        message,
        ...(requestId !== undefined && { requestId }),
        ...(more.paidUntil !== undefined && { paidUntil: more.paidUntil?.toISOString() ?? null }),
      },
    },
    { status: STATUS[code] },
  );
}
