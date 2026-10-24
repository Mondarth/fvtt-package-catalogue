import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { packageReleases, pluginOptions } from './release-packages.js';

/**
 * Each workspace package is released on its own (release.base.js): semantic-release runs in the
 * package's directory, and semantic-release-monorepo keeps to the commits that change it. These
 * check that every package is wired up the same way, and that the release workflow knows of it.
 */

interface Job {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  steps?: { run?: string; with?: Record<string, string> }[];
}

const workflow = parse(readFileSync('.github/workflows/release.yml', 'utf8')) as { jobs: Record<string, Job> };
const rootManifest = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const releases = await packageReleases();

/** The workflow output a package's release writes its tag to. */
function outputOf(config: Parameters<typeof pluginOptions>[0]): string {
  const successCmd = String(pluginOptions(config, '@semantic-release/exec')?.successCmd);
  const output = /^echo "([\w-]+-tag)=\$\{nextRelease\.gitTag\}" >> "\$GITHUB_OUTPUT"$/.exec(successCmd)?.[1];
  if (output === undefined) throw new Error(`unexpected successCmd: ${successCmd}`);
  return output;
}

describe.each(releases)('the release of $dir', ({ dir, config }) => {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    private?: boolean;
    publishConfig?: { access?: string };
  };
  const publishCmd = pluginOptions(config, '@semantic-release/exec')?.publishCmd as string | undefined;

  it('counts only the commits that change the package, and tags it with the package name', () => {
    expect(config.extends).toBe('semantic-release-monorepo');
  });

  it('is cut from main only', () => {
    expect(config.branches).toEqual(['main']);
  });

  // @semantic-release/git commits only modified files under the directory semantic-release runs in.
  it('commits only files in the package', () => {
    const assets = pluginOptions(config, '@semantic-release/git')?.assets as string[];
    expect(assets.every(asset => !asset.startsWith('..') && !asset.startsWith('/'))).toBe(true);
  });

  it('hands its tag to the release workflow', () => {
    const output = outputOf(config);
    expect(workflow.jobs.release?.outputs?.[output]).toBe(`\${{ steps.release.outputs.${output} }}`);
    expect(workflow.jobs['sync-dev']?.if).toContain(`needs.release.outputs.${output} != ''`);
  });

  it('publishes to npm only if it is public, with pnpm, through trusted publishing', () => {
    if (manifest.private === true) {
      expect(publishCmd).toBeUndefined();
      return;
    }
    expect(publishCmd).toMatch(/^pnpm publish\b/);
    expect(manifest.publishConfig?.access).toBe('public');
    expect(workflow.jobs.release?.permissions?.['id-token']).toBe('write');
  });
});

describe('the releases', () => {
  it('write their tags to outputs of their own', () => {
    const outputs = releases.map(({ config }) => outputOf(config));
    expect(new Set(outputs).size).toBe(outputs.length);
  });

  it('run in every package, one at a time, from the release workflow', () => {
    expect(rootManifest.scripts.release).toBe('pnpm --recursive --workspace-concurrency=1 exec semantic-release');
    expect(workflow.jobs.release?.steps?.map(step => step.run)).toContain('pnpm release');
  });

  it('wait for CI and the end-to-end tests', () => {
    expect(workflow.jobs.release?.needs).toEqual(['ci', 'e2e']);
  });

  it("publish the catalogue's image, and the documentation, from the catalogue's release tag", () => {
    expect(workflow.jobs.image?.if).toBe("needs.release.outputs.catalogue-tag != ''");
    const imageRef = workflow.jobs.image?.steps?.find(step => step.with?.ref !== undefined)?.with?.ref;
    expect(imageRef).toBe('${{ needs.release.outputs.catalogue-tag }}');
    const pagesRef = workflow.jobs.pages?.steps?.find(step => step.with?.ref !== undefined)?.with?.ref;
    expect(pagesRef).toBe('${{ needs.release.outputs.catalogue-tag || github.sha }}');
  });
});
