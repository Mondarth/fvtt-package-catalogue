import { describe, expect, it } from 'vitest';

import { checkNickname, RESERVED, shownName } from '../../../../src/lib/server/accounts/nickname.js';

describe('checkNickname', () => {
  it('keeps a nickname, its spaces tidied', () => {
    expect(checkNickname('  Ulenar   of_Mondarth-2 ')).toEqual({ ok: true, nickname: 'Ulenar of_Mondarth-2' });
  });

  it('takes letters of any script, counting characters rather than code units', () => {
    expect(checkNickname('Ñandú')).toEqual({ ok: true, nickname: 'Ñandú' });
    expect(checkNickname('𝒜𝒷𝒸')).toEqual({ ok: true, nickname: '𝒜𝒷𝒸' });
  });

  it('clears the nickname for nothing, or only spaces', () => {
    expect(checkNickname('')).toEqual({ ok: true, nickname: null });
    expect(checkNickname('   ')).toEqual({ ok: true, nickname: null });
  });

  it('refuses one too short or too long', () => {
    expect(checkNickname('ab')).toEqual({ ok: false, problem: 'length' });
    expect(checkNickname('a'.repeat(33))).toEqual({ ok: false, problem: 'length' });
    expect(checkNickname('a'.repeat(32))).toMatchObject({ ok: true });
  });

  it('refuses other characters', () => {
    expect(checkNickname('<script>')).toEqual({ ok: false, problem: 'characters' });
    expect(checkNickname('me@home')).toEqual({ ok: false, problem: 'characters' });
  });

  it('refuses a reserved name, whatever its case', () => {
    expect(RESERVED).toContain('admin');
    expect(checkNickname('ADMIN')).toEqual({ ok: false, problem: 'reserved' });
  });
});

describe('shownName', () => {
  it('is the nickname where there is one, or else the handle', () => {
    expect(shownName({ handle: 'amber-falcon-ridge-42', nickname: 'Ulenar' })).toBe('Ulenar');
    expect(shownName({ handle: 'amber-falcon-ridge-42', nickname: null })).toBe('amber-falcon-ridge-42');
    expect(shownName({ handle: 'amber-falcon-ridge-42' })).toBe('amber-falcon-ridge-42');
  });
});
