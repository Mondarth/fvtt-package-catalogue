import { describe, expect, it } from 'vitest';

import { endpoint } from '../../../../src/lib/server/http/endpoint.js';
import { fakeEvent } from '../../support/event.js';
import { memoryLogger } from '../../support/logger.js';

describe('endpoint', () => {
  it("answers with the endpoint's response", async () => {
    const response = await endpoint(() => Promise.resolve(new Response('fine')))(fakeEvent());
    expect(await response.text()).toBe('fine');
  });

  it('answers internal, and logs the error, when the endpoint throws', async () => {
    const log = memoryLogger();
    const response = await endpoint(() => Promise.reject(new Error('database down')))(fakeEvent({ locals: { log } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'internal', message: 'Something went wrong in the catalogue', requestId: 'request-1' },
    });
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({ level: 'error', error: { message: 'database down' } });
  });
});
