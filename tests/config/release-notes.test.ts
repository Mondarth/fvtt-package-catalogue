import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { packageRelease } from '../../release.base.js';

/**
 * semantic-release renders the release notes with its own copy of conventional-changelog-writer,
 * and the preset must be a version that writer can render. A mismatch only shows up when a
 * release is cut, so this renders notes the same way, with the same plugin and options.
 */

type GenerateNotes = (pluginConfig: object, context: object) => Promise<string>;

type AnalyzeCommits = (pluginConfig: object, context: object) => Promise<string | null>;

/** Loads a plugin's export from semantic-release's own dependencies, as semantic-release does. */
async function loadPlugin<T>(name: string, exported: string): Promise<T> {
  const fromSemanticRelease = createRequire(createRequire(import.meta.url).resolve('semantic-release/package.json'));
  const module: unknown = await import(fromSemanticRelease.resolve(name));
  if (typeof module !== 'object' || module === null || !(exported in module)) {
    throw new Error(`${name} does not export ${exported}`);
  }
  return (module as Record<string, unknown>)[exported] as T;
}

/** Loads the release-notes plugin. */
const loadGenerateNotes = () => loadPlugin<GenerateNotes>('@semantic-release/release-notes-generator', 'generateNotes');

const config = packageRelease({ output: 'version' });

/** The options each package passes to a plugin (release.base.js). */
function pluginOptions(name: string): object {
  for (const plugin of config.plugins) {
    if (Array.isArray(plugin) && plugin[0] === name) return plugin[1] as object;
  }
  throw new Error(`${name} is not configured`);
}

describe('release notes', () => {
  it('render with the configured preset', async () => {
    const generateNotes = await loadGenerateNotes();

    const notes = await generateNotes(pluginOptions('@semantic-release/release-notes-generator'), {
      cwd: process.cwd(),
      options: { repositoryUrl: 'https://github.com/Mondarth/fvtt-package-catalogue.git' },
      logger: { log: () => undefined, error: () => undefined },
      lastRelease: { gitTag: 'v1.0.0', version: '1.0.0' },
      nextRelease: { gitTag: 'v1.1.0', version: '1.1.0' },
      commits: [
        { hash: 'aaaaaaa1', message: 'feat(api): add a thing' },
        { hash: 'aaaaaaa2', message: 'fix(repo): repair a thing' },
        { hash: 'aaaaaaa3', message: 'ci(release): not in the notes' },
      ],
    });

    expect(notes).toContain('### Features');
    expect(notes).toContain('**api:** add a thing');
    expect(notes).toContain('### Bug Fixes');
    expect(notes).toContain('**repo:** repair a thing');
    expect(notes).not.toContain('not in the notes');
  });

  it('show a dependency bump', async () => {
    const generateNotes = await loadGenerateNotes();

    const notes = await generateNotes(pluginOptions('@semantic-release/release-notes-generator'), {
      cwd: process.cwd(),
      options: { repositoryUrl: 'https://github.com/Mondarth/fvtt-package-catalogue.git' },
      logger: { log: () => undefined, error: () => undefined },
      lastRelease: { gitTag: 'v1.0.0', version: '1.0.0' },
      nextRelease: { gitTag: 'v1.0.1', version: '1.0.1' },
      commits: [{ hash: 'aaaaaaa1', message: 'build(deps): bump a runtime library' }],
    });

    expect(notes).toContain('### Build System');
    expect(notes).toContain('**deps:** bump a runtime library');
  });
});

describe('releases', () => {
  it.each([
    ['build(deps): bump a runtime library', 'patch'],
    ['build(deps-dev): bump a development tool', null],
    ['build(contract): change how it is built', null],
    ['fix(api): repair a thing', 'patch'],
    ['perf(api): speed a thing up', 'patch'],
    ['feat(api): add a thing', 'minor'],
  ])('cut for %s: %s', async (message, release) => {
    const analyzeCommits = await loadPlugin<AnalyzeCommits>('@semantic-release/commit-analyzer', 'analyzeCommits');

    const type = await analyzeCommits(pluginOptions('@semantic-release/commit-analyzer'), {
      cwd: process.cwd(),
      logger: { log: () => undefined, error: () => undefined },
      commits: [{ hash: 'aaaaaaa1', message }],
    });

    expect(type).toBe(release);
  });
});
