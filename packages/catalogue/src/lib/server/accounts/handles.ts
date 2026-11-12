/**
 * Handles: the random names a profile is given when it is made, shown wherever its owner has set no nickname. Three
 * plain words and two digits, such as `amber-falcon-ridge-42`: easy to read out, and with a hundred words of each kind
 * there are a hundred million of them, so one taken already is rare and is simply made again.
 */
import { randomInt } from 'node:crypto';

// prettier-ignore
export const ADJECTIVES = [
  'amber', 'ancient', 'arctic', 'ashen', 'autumn', 'azure', 'bold', 'brave', 'breezy', 'bright',
  'bronze', 'calm', 'cedar', 'clever', 'cloudy', 'copper', 'coral', 'cosy', 'crimson', 'crystal',
  'dapper', 'dawn', 'deep', 'distant', 'dusky', 'eager', 'early', 'ember', 'emerald', 'evening',
  'fabled', 'fair', 'fern', 'fiery', 'gentle', 'gilded', 'glad', 'golden', 'grand', 'green',
  'hardy', 'hazel', 'hidden', 'hollow', 'honest', 'humble', 'icy', 'idle', 'indigo', 'ivory',
  'jade', 'jolly', 'keen', 'kind', 'lively', 'lone', 'lucky', 'lunar', 'mellow', 'merry',
  'misty', 'mossy', 'nimble', 'noble', 'north', 'oaken', 'olive', 'pale', 'patient', 'plucky',
  'proud', 'quick', 'quiet', 'rapid', 'rosy', 'royal', 'ruby', 'rustic', 'sable', 'sandy',
  'scarlet', 'shady', 'silent', 'silver', 'sleek', 'snowy', 'solar', 'south', 'steady', 'stony',
  'sunny', 'swift', 'tawny', 'tidal', 'tranquil', 'velvet', 'vivid', 'wandering', 'wild', 'witty',
] as const;

// prettier-ignore
export const NOUNS = [
  'acorn', 'anchor', 'anvil', 'arrow', 'aspen', 'badger', 'banner', 'beacon', 'bear', 'birch',
  'bramble', 'brook', 'candle', 'canyon', 'castle', 'cliff', 'comet', 'compass', 'crane', 'creek',
  'crown', 'dragon', 'dune', 'eagle', 'falcon', 'feather', 'fjord', 'flint', 'forest', 'fox',
  'galleon', 'garden', 'glade', 'griffin', 'grove', 'harbour', 'hare', 'harp', 'hawk', 'heron',
  'hill', 'island', 'kestrel', 'lantern', 'lark', 'meadow', 'mesa', 'mill', 'moon', 'moor',
  'oak', 'orchard', 'otter', 'owl', 'pebble', 'phoenix', 'pine', 'quill', 'raven', 'reed',
  'ridge', 'river', 'robin', 'rook', 'rowan', 'sail', 'scroll', 'shield', 'shore', 'sparrow',
  'spire', 'spring', 'star', 'stone', 'storm', 'summit', 'swallow', 'thistle', 'thorn', 'tide',
  'tower', 'trail', 'valley', 'vale', 'violet', 'wagon', 'willow', 'wind', 'wolf', 'wren',
  'beech', 'bell', 'cairn', 'cove', 'dell', 'elm', 'fen', 'gale', 'heath', 'lynx',
] as const;

/** A whole number from 0 up to, but not including, a bound. */
export type Random = (bound: number) => number;

/**
 * A new handle.
 *
 * @param random - Where the choices come from; crypto's `randomInt` by default
 * @returns The handle, such as `amber-falcon-ridge-42`
 */
export function newHandle(random: Random = randomInt): string {
  const pick = <T>(words: readonly T[]): T => words[random(words.length)] as T;
  const words = [pick(ADJECTIVES), pick(NOUNS), pick(NOUNS)];
  return `${words.join('-')}-${String(random(100)).padStart(2, '0')}`;
}

/** How many times a handle is made again before giving up, should every one made be taken. */
export const HANDLE_ATTEMPTS = 10;

/**
 * A handle no one has.
 *
 * @param taken - Whether a handle is someone's already
 * @param random - Where the choices come from
 * @returns The handle
 * @throws {Error} If every one made was taken
 */
export async function freeHandle(taken: (handle: string) => Promise<boolean>, random?: Random): Promise<string> {
  for (let attempt = 0; attempt < HANDLE_ATTEMPTS; attempt++) {
    const handle = newHandle(random);
    if (!(await taken(handle))) return handle;
  }
  throw new Error(`No free handle found in ${String(HANDLE_ATTEMPTS)} attempts`);
}
