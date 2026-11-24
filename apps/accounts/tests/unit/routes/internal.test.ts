import { describe, expect, it, vi } from 'vitest';

const internal = vi.hoisted(() => vi.fn((request: Request) => Promise.resolve(new Response(request.method))));
vi.mock('#lib/server/runtime.js', () => ({ internal }));

const { fallback } = await import('../../../src/routes/internal/[...path]/+server.js');

describe('the internal API route', () => {
  it('hands every request to the internal API, whatever its method', async () => {
    for (const method of ['POST', 'GET']) {
      const request = new Request('http://accounts.test/internal/v1/token-user', { method });
      const response = await fallback({ request } as never);
      expect(await response.text()).toBe(method);
      expect(internal).toHaveBeenLastCalledWith(request);
    }
  });
});
