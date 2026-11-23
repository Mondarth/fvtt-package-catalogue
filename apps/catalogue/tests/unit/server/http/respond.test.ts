import { HealthResponse } from '@mondarth/fvtt-package-catalogue-contract';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { apiError, respond } from '../../../../src/lib/server/http/respond.js';

describe('respond', () => {
  it('sends a body the contract accepts, as JSON', async () => {
    const response = respond(HealthResponse, { status: 'ok' }, { headers: { 'X-Test': '1' } });
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-Test')).toBe('1');
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('refuses to send a body that breaks the contract', () => {
    // @ts-expect-error -- the bug being guarded against
    expect(() => respond(HealthResponse, { status: 'fine' })).toThrow(ZodError);
  });
});

describe('apiError', () => {
  it.each([
    ['bad-request', 400],
    ['unauthorised', 401],
    ['not-found', 404],
    ['method-not-allowed', 405],
    ['rate-limited', 429],
    ['internal', 500],
    ['unavailable', 503],
  ] as const)('answers %s with %i', (code, status) => {
    expect(apiError(code, 'why').status).toBe(status);
  });

  it('carries the request id when there is one', async () => {
    expect(await apiError('not-found', 'gone', 'r1').json()).toEqual({
      error: { code: 'not-found', message: 'gone', requestId: 'r1' },
    });
    expect(await apiError('not-found', 'gone').json()).toEqual({ error: { code: 'not-found', message: 'gone' } });
  });
});
