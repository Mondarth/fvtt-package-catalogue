/**
 * API keys. As with EMMA's default proxy, a key ships inside the clients that use it, so it cannot be kept secret: it
 * identifies a client and keeps out traffic that is not theirs. The data is public. Several keys are accepted at
 * once, so that a key can be rotated.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (key: string): Buffer => createHash('sha256').update(key).digest();

/**
 * A check of a presented key against those accepted, in time that does not depend on how much of a key matches.
 *
 * @param keys - The keys accepted
 * @returns Whether a presented key is one of them
 */
export function keyMatcher(keys: readonly string[]): (presented: string | null) => boolean {
  const accepted = keys.map(digest);
  return presented => {
    if (presented === null || presented === '') return false;
    const candidate = digest(presented);
    // Every key is compared, so that the time taken does not say which one matched.
    return accepted.reduce((found, key) => timingSafeEqual(key, candidate) || found, false);
  };
}
