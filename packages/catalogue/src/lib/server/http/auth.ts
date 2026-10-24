/**
 * API keys. As with EMMA's default proxy, a key ships inside the clients that use it, so it cannot be kept secret: it
 * identifies a client and keeps out traffic that is not theirs. The data is public. Several keys are accepted at
 * once, so that a key can be rotated.
 */
import { timingSafeEqual } from 'node:crypto';

/**
 * A check of a presented key against those accepted. Keys of the same length are compared in time that does not
 * depend on how much of them matches; a key's length says nothing worth hiding. The keys are compared as they are,
 * not hashed: nothing is stored, so there is nothing a hash would protect.
 *
 * @param keys - The keys accepted
 * @returns Whether a presented key is one of them
 */
export function keyMatcher(keys: readonly string[]): (presented: string | null) => boolean {
  const accepted = keys.map(key => Buffer.from(key, 'utf8'));
  return presented => {
    if (presented === null || presented === '') return false;
    const candidate = Buffer.from(presented, 'utf8');
    // Every key is compared, so that the time taken does not say which one matched.
    return accepted.reduce(
      (found, key) => (key.length === candidate.length && timingSafeEqual(key, candidate)) || found,
      false,
    );
  };
}
