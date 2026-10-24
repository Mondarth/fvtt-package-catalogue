/**
 * Sets the release version in the package's package.json. This replaces @semantic-release/npm,
 * which runs `npm version`: the workspace requires pnpm through devEngines, so npm refuses to run
 * here. Packages are published with `pnpm publish` instead (see `publishCmd`).
 */
export const bumpVersionCmd = 'pnpm pkg set version=${nextRelease.version}';

/**
 * @typedef {object} PackageRelease
 * @property {string[]} [prepare] Commands that build what the release ships, after the version is set
 * @property {string} [publishCmd] Publishes the package to a registry; packages without one are only tagged
 * @property {string} output The release workflow's output that receives the release's tag
 * @property {{ path: string, label: string }[]} [githubAssets] Files attached to the GitHub release
 */

/**
 * The semantic-release configuration of one workspace package. Each package's release.config.js
 * calls this, and semantic-release runs in the package's directory (`pnpm release`).
 *
 * semantic-release-monorepo counts only the commits that change files in the package, and tags
 * each release `<package name>-v<version>`. Releases are cut from `main` only; day-to-day work
 * lands on `dev`. Version numbers follow strict SemVer derived from Conventional Commits:
 * `fix` -> patch, `feat` -> minor, `BREAKING CHANGE:` / `!` -> major.
 *
 * semantic-release runs in the package's directory, and @semantic-release/git commits only files
 * under it, so everything a release changes must live in the package.
 *
 * @param {PackageRelease} release
 * @returns {import('semantic-release').GlobalConfig}
 */
export function packageRelease({ prepare = [], publishCmd, output, githubAssets = [] }) {
  return {
    extends: 'semantic-release-monorepo',
    branches: ['main'],
    plugins: [
      ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
      ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
      ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
      [
        '@semantic-release/exec',
        {
          // Sets the version first, so what is built carries it.
          prepareCmd: [bumpVersionCmd, ...prepare].join(' && '),
          ...(publishCmd === undefined ? {} : { publishCmd }),
          // Hands the release's tag to the later jobs of the release workflow. Not the version:
          // semantic-release-monorepo gives the whole tag as the version by this step.
          successCmd: `echo "${output}=\${nextRelease.gitTag}" >> "$GITHUB_OUTPUT"`,
        },
      ],
      [
        '@semantic-release/git',
        {
          assets: ['CHANGELOG.md', 'package.json'],
          message: 'chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}',
        },
      ],
      ['@semantic-release/github', { assets: githubAssets }],
    ],
  };
}
