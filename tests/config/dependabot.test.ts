import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Major updates Dependabot must not offer, each of which passed CI and would have broken something later: the next
 * release's notes, the image's build, or a deployment's database.
 */

interface Update {
  'package-ecosystem': string;
  ignore?: { 'dependency-name': string; 'update-types'?: string[] }[];
}

const { updates } = parse(readFileSync('.github/dependabot.yml', 'utf8')) as { updates: Update[] };

/** Whether Dependabot skips major updates of a dependency in an ecosystem. */
const ignoresMajor = (ecosystem: string, dependency: string): boolean =>
  updates
    .filter(update => update['package-ecosystem'] === ecosystem)
    .every(update =>
      update.ignore?.some(
        rule =>
          rule['dependency-name'] === dependency &&
          rule['update-types']?.includes('version-update:semver-major') === true,
      ),
    );

describe('Dependabot', () => {
  it.each([
    ['npm', '@types/node'],
    ['npm', 'conventional-changelog-conventionalcommits'],
    ['docker', 'node'],
    ['docker-compose', 'postgres'],
  ])('leaves major updates of %s %s to be made by hand', (ecosystem, dependency) => {
    expect(ignoresMajor(ecosystem, dependency)).toBe(true);
  });

  it('targets dev with every update', () => {
    expect(updates.map(update => (update as { 'target-branch'?: string })['target-branch'])).toEqual(
      updates.map(() => 'dev'),
    );
  });
});
