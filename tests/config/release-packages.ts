import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { GlobalConfig, PluginSpec } from 'semantic-release';

/** A workspace package and its semantic-release configuration. */
export interface PackageRelease {
  /** The package's directory, from the repository root. */
  dir: string;
  config: GlobalConfig;
}

/**
 * The directory of every package in the workspace: the applications under `apps/` and the libraries under `packages/`,
 * as git tracks them, so that a directory holding only what a tool generated is none.
 */
export const packageDirs: string[] = execFileSync(
  'git',
  ['ls-files', '--', ':(glob)apps/*/package.json', ':(glob)packages/*/package.json'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(path => path !== '')
  .map(path => dirname(path));

/** Every workspace package with its release configuration. */
export async function packageReleases(): Promise<PackageRelease[]> {
  return Promise.all(
    packageDirs.map(async dir => {
      const file = pathToFileURL(resolve(dir, 'release.config.js')).href;
      const module = (await import(/* @vite-ignore */ file)) as { default: GlobalConfig };
      return { dir, config: module.default };
    }),
  );
}

/** The options a configuration passes to a plugin, or undefined when it does not use it. */
export function pluginOptions(config: GlobalConfig, name: string): Record<string, unknown> | undefined {
  for (const plugin of config.plugins as PluginSpec[]) {
    if (Array.isArray(plugin) && plugin[0] === name) return plugin[1] as Record<string, unknown>;
    if (plugin === name) return {};
  }
  return undefined;
}
