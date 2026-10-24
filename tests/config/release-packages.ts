import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { GlobalConfig, PluginSpec } from 'semantic-release';

/** A workspace package and its semantic-release configuration. */
export interface PackageRelease {
  /** The package's directory, from the repository root. */
  dir: string;
  config: GlobalConfig;
}

/** The directory of every package in the workspace. */
export const packageDirs: string[] = readdirSync('packages').map(name => join('packages', name));

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
