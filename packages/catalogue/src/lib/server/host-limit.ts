/**
 * Limiting how many requests are made to one host at once. The worker crawls several packages at once, and each crawl's
 * client makes several requests at once, so without a limit across them all one host, such as GitHub's API, could be
 * asked many times at once.
 */

/**
 * A fetch that makes at most `perHost` requests to any one host at once; the rest wait their turn, in order.
 *
 * @param send - The fetch to send them with
 * @param perHost - How many at once, to each host
 * @returns The fetch
 */
export function hostLimited(send: typeof globalThis.fetch, perHost: number): typeof globalThis.fetch {
  const running = new Map<string, number>();
  const waiting = new Map<string, (() => void)[]>();

  /** Waits for a turn at a host, then takes it. */
  async function take(host: string): Promise<void> {
    while ((running.get(host) ?? 0) >= perHost) {
      await new Promise<void>(resolve => {
        waiting.set(host, [...(waiting.get(host) ?? []), resolve]);
      });
    }
    running.set(host, (running.get(host) ?? 0) + 1);
  }

  /** Gives a turn at a host back, to the next waiting for it. */
  function give(host: string): void {
    /* v8 ignore next -- a turn given back was taken, so its host is counted */
    const left = (running.get(host) ?? 1) - 1;
    if (left === 0) running.delete(host);
    else running.set(host, left);
    const [next, ...rest] = waiting.get(host) ?? [];
    if (rest.length === 0) waiting.delete(host);
    else waiting.set(host, rest);
    next?.();
  }

  return async (input, init) => {
    let host: string;
    try {
      host = new URL(input instanceof Request ? input.url : input).host;
    } catch {
      // Not a URL: the fetch refuses it, as it would without a limit.
      return send(input, init);
    }
    await take(host);
    try {
      return await send(input, init);
    } finally {
      give(host);
    }
  };
}
