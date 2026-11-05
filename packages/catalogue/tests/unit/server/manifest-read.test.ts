import { describe, expect, it } from 'vitest';

import { manifestShape, manifestTypeOf, readManifest } from '../../../src/lib/server/manifest-read.js';
import { mockStore } from '../support/store.js';

import type { SafeFetched } from '../../../src/lib/server/safe-fetch.js';

const URL_GIVEN = 'https://example.com/midi-qol/module.json';

const answering = (fetched: SafeFetched) => () => Promise.resolve(fetched);
const json = (value: unknown): SafeFetched => ({ ok: true, url: URL_GIVEN, body: JSON.stringify(value) });

const manifest = {
  id: 'midi-qol',
  title: 'Midi QOL',
  version: '14.0.20',
  compatibility: { minimum: '14', verified: '14.368' },
  manifest: 'https://example.com/midi-qol/latest/module.json',
  download: 'https://example.com/midi-qol/14.0.20/module.zip',
};

describe('manifestShape', () => {
  it('gives the ID, title and version, the title the ID if there is none', () => {
    expect(manifestShape(manifest)).toEqual({ id: 'midi-qol', title: 'Midi QOL', version: '14.0.20' });
    expect(manifestShape({ id: 'a', version: 1 })).toEqual({ id: 'a', title: 'a', version: '1' });
  });

  it('gives nothing for what is no manifest', () => {
    for (const value of [
      null,
      'text',
      { id: '', version: '1' },
      { id: 'a' },
      { id: 'a', version: '' },
      { version: '1' },
    ]) {
      expect(manifestShape(value)).toBeUndefined();
    }
  });
});

describe('manifestTypeOf', () => {
  it('is by the file name, then by the fields only a game system declares', () => {
    expect(manifestTypeOf('https://example.com/module.json', {})).toBe('module');
    expect(manifestTypeOf('https://example.com/system-v2.json', {})).toBe('system');
    expect(manifestTypeOf('https://example.com/latest', { initiative: '1d20' })).toBe('system');
    expect(manifestTypeOf('https://example.com/latest', { id: 'a' })).toBeUndefined();
    expect(manifestTypeOf('https://example.com/latest', null)).toBeUndefined();
  });
});

describe('readManifest', () => {
  it('gives the release, its manifest the URL given, for its version alone, and queues its package by it', async () => {
    const store = mockStore();
    const found = await readManifest(store, { url: URL_GIVEN, type: 'module' }, answering(json(manifest)));
    expect(found).toMatchObject({
      ok: true,
      title: 'Midi QOL',
      release: {
        package: { type: 'module', id: 'midi-qol' },
        version: '14.0.20',
        manifest: URL_GIVEN,
        versionManifest: URL_GIVEN,
        download: manifest.download,
      },
    });
    expect(store.requestCrawl).toHaveBeenCalledWith([
      { package: { type: 'module', id: 'midi-qol' }, reason: 'request', manifest: URL_GIVEN },
    ]);
  });

  it('says why what could not be had could not, and of which host', async () => {
    const store = mockStore();
    const read = (fetched: SafeFetched) => readManifest(store, { url: URL_GIVEN, type: 'module' }, answering(fetched));
    expect(await read({ ok: false, reason: 'http', status: 404 })).toEqual({
      ok: false,
      problem: 'unreadable',
      reason: 'http',
      status: 404,
      host: 'example.com',
    });
    expect(await read({ ok: false, reason: 'refused' })).toEqual({
      ok: false,
      problem: 'unreadable',
      reason: 'refused',
      host: 'example.com',
    });
    expect(await read({ ok: true, url: URL_GIVEN, body: '<html>' })).toEqual({
      ok: false,
      problem: 'unreadable',
      reason: 'invalid',
      host: 'example.com',
    });
    expect(store.requestCrawl).not.toHaveBeenCalled();
  });

  it('refuses a manifest of the other type, which Foundry VTT would install as the type asked', async () => {
    const found = await readManifest(
      mockStore(),
      { url: 'https://example.com/dnd5e/system.json', type: 'module' },
      answering(json({ id: 'dnd5e', version: '5.1.0' })),
    );
    expect(found).toEqual({ ok: false, problem: 'other-type', type: 'system' });
  });

  it('says what is no manifest is not, as the resolver reads it or the contract would send it', async () => {
    const read = (value: unknown) =>
      readManifest(mockStore(), { url: 'https://example.com/latest', type: 'module' }, answering(json(value)));
    expect(await read({ name: 'not a manifest' })).toEqual({ ok: false, problem: 'not-manifest' });
    // An ID no package can have: the resolver reads it, the contract would not send it.
    expect(await read({ id: 'a/b', version: '1.0.0' })).toEqual({ ok: false, problem: 'not-manifest' });
    expect(await read({ id: 'a', version: '1.0.0', relationships: 'none' })).toMatchObject({ ok: true });
  });
});
