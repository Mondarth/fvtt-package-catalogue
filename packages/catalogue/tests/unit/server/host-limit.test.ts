import { describe, expect, it, vi } from 'vitest';

import { hostLimited } from '../../../src/lib/server/host-limit.js';

/** A fetch whose every answer waits until released, recording what was asked, in order. */
function heldFetch() {
  const asked: string[] = [];
  const pending: (() => void)[] = [];
  const send = vi.fn<typeof globalThis.fetch>(input => {
    asked.push(input instanceof Request ? input.url : String(input));
    return new Promise(resolve => {
      pending.push(() => {
        resolve(new Response('ok'));
      });
    });
  });
  return { send, asked, release: () => pending.shift()?.() };
}

/** Lets every promise that can settle, settle. */
const settled = () => new Promise(resolve => setTimeout(resolve, 0));

describe('hostLimited', () => {
  it('makes at most so many requests to one host at once, and the rest in turn', async () => {
    const { send, asked, release } = heldFetch();
    const fetch = hostLimited(send, 2);
    const answers = ['a', 'b', 'c', 'd'].map(path => fetch(`https://api.test/${path}`));
    await settled();
    expect(asked).toEqual(['https://api.test/a', 'https://api.test/b']);
    release();
    await settled();
    expect(asked).toEqual(['https://api.test/a', 'https://api.test/b', 'https://api.test/c']);
    release();
    release();
    await settled();
    release();
    await Promise.all(answers);
    expect(asked).toHaveLength(4);
  });

  it('limits each host apart', async () => {
    const { send, asked } = heldFetch();
    const fetch = hostLimited(send, 1);
    void fetch('https://one.test/a');
    void fetch(new URL('https://one.test/b'));
    void fetch(new Request('https://two.test/a'));
    await settled();
    expect(asked).toEqual(['https://one.test/a', 'https://two.test/a']);
  });

  it('gives the turn back when a request fails', async () => {
    const send = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValue(new Response('ok'));
    const fetch = hostLimited(send, 1);
    await expect(fetch('https://one.test/a')).rejects.toThrow('network');
    await expect(fetch('https://one.test/b')).resolves.toBeInstanceOf(Response);
  });

  it('sends what is not a URL as it is, for the fetch to refuse', async () => {
    const send = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('Invalid URL'));
    await expect(hostLimited(send, 1)('not a url')).rejects.toThrow('Invalid URL');
    expect(send).toHaveBeenCalledWith('not a url', undefined);
  });
});
