import { describe, expect, it, vi } from 'vitest';

import {
  ADJECTIVES,
  freeHandle,
  HANDLE_ATTEMPTS,
  newHandle,
  NOUNS,
} from '../../../../src/lib/server/accounts/handles.js';

describe('the word lists', () => {
  it('have a hundred plain, lower-case words each, none twice', () => {
    for (const words of [ADJECTIVES, NOUNS]) {
      expect(words).toHaveLength(100);
      expect(new Set(words).size).toBe(100);
      for (const word of words) expect(word).toMatch(/^[a-z]+$/);
    }
  });
});

describe('newHandle', () => {
  it('is an adjective, two nouns and two digits, each chosen at random', () => {
    const picks = [0, 1, 2, 7];
    const random = vi.fn<(bound: number) => number>(() => picks.shift() ?? 0);
    expect(newHandle(random)).toBe(`${ADJECTIVES[0]}-${NOUNS[1]}-${NOUNS[2]}-07`);
    expect(random.mock.calls.map(([bound]) => bound).sort()).toEqual([100, 100, 100, 100]);
  });

  it("chooses with crypto's randomness by default", () => {
    expect(newHandle()).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d\d$/);
  });
});

describe('freeHandle', () => {
  it('makes a handle again while the one made is taken', async () => {
    let n = 0;
    const random = () => n++ % 100;
    const taken = vi.fn((handle: string) => Promise.resolve(handle.startsWith(`${ADJECTIVES[0]}-`)));
    const handle = await freeHandle(taken, random);
    expect(handle.startsWith(`${ADJECTIVES[0]}-`)).toBe(false);
    expect(taken).toHaveBeenCalledTimes(2);
  });

  it('gives up when every handle made is taken', async () => {
    const taken = vi.fn(() => Promise.resolve(true));
    await expect(freeHandle(taken)).rejects.toThrow(`No free handle found in ${String(HANDLE_ATTEMPTS)} attempts`);
    expect(taken).toHaveBeenCalledTimes(HANDLE_ATTEMPTS);
  });
});
