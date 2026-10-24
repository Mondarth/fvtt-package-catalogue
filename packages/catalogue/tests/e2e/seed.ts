import type { Release } from '@mondarth/fvtt-package-catalogue-contract';

/** A package the database is seeded with. */
export const SEEDED = { type: 'module', id: 'e2e-module' } as const;

export const SEEDED_AT = new Date('2026-10-24T09:00:00.000Z');

export const SEEDED_RELEASES: Release[] = [
  {
    package: SEEDED,
    version: '1.0.0',
    compatibility: { minimum: '13', verified: '14' },
    relationships: {
      requires: [{ package: { type: 'module', id: 'lib-wrapper' }, compatibility: { minimum: '1.12.0' } }],
      systems: [{ package: { type: 'system', id: 'dnd5e' }, compatibility: {} }],
      conflicts: [],
      recommends: [],
    },
    manifest: 'https://example.com/e2e-module/module.json',
    download: 'https://example.com/e2e-module/1.0.0.zip',
    protected: false,
    origin: 'https://example.com/e2e-module/module.json',
    detail: 'loaded',
  },
  {
    package: SEEDED,
    version: '1.1.0',
    compatibility: { minimum: '14' },
    relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
    protected: false,
    origin: 'https://r2.foundryvtt.com/package-api-public/e2e-module.json',
    detail: 'listed',
  },
];
