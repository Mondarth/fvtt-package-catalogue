import type { Release } from '../src/index.js';

/** A loaded release with something in every field. */
export const loaded: Release = {
  package: { type: 'module', id: 'midi-qol' },
  version: '13.0.4',
  compatibility: { minimum: '13', verified: '13.351' },
  relationships: {
    requires: [
      {
        package: { type: 'module', id: 'lib-wrapper' },
        compatibility: { minimum: '1.12.0' },
        manifest: 'https://github.com/ruipin/fvtt-lib-wrapper/releases/latest/download/module.json',
        reason: 'Patches core functions',
      },
    ],
    systems: [{ package: { type: 'system', id: 'dnd5e' }, compatibility: { minimum: '4.0.0' } }],
    conflicts: [],
    recommends: [],
  },
  manifest: 'https://gitlab.com/tposney/midi-qol/raw/v13/package/module.json',
  download: 'https://gitlab.com/tposney/midi-qol/-/raw/v13/package/midi-qol-v13.0.4.zip',
  versionManifest: 'https://gitlab.com/tposney/midi-qol/-/raw/v13.0.4/package/module.json',
  protected: false,
  origin: 'https://gitlab.com/tposney/midi-qol/raw/v13/package/module.json',
  detail: 'loaded',
  listing: { minimum: '13', verified: '13' },
};

/** A release known only from Foundry VTT's listing. */
export const listed: Release = {
  package: { type: 'system', id: 'dnd5e' },
  version: '5.1.0',
  compatibility: { minimum: '13' },
  relationships: { requires: [], systems: [], conflicts: [], recommends: [] },
  manifest: 'https://github.com/foundryvtt/dnd5e/releases/download/release-5.1.0/system.json',
  protected: false,
  origin: 'https://r2.foundryvtt.com/package-api-public/dnd5e.json',
  detail: 'listed',
};
