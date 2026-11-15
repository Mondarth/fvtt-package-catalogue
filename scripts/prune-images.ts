/**
 * Deletes the container image's old versions from the GitHub Container Registry, so that the private package stays
 * within the organisation's storage. It keeps the newest releases, every version a moving tag (`latest`, a major or a
 * major.minor line) still names, and every manifest those versions are made of; it deletes the other releases, and
 * the untagged manifests nothing kept is made of.
 *
 *   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name KEEP=10 DRY_RUN=true node scripts/prune-images.ts
 *
 * A multi-platform image is an index, tagged, whose platform images and attestations are untagged versions of their
 * own: deleting one of those would break an image that is kept, so the manifests each kept version is made of are read
 * from the registry first, and the script stops without deleting anything if one cannot be read.
 */

const releaseTag = /^\d+\.\d+\.\d+$/;

/** Untagged manifests this recent may belong to an image still being pushed, and are left alone. */
const settleMs = 60 * 60 * 1000;

/** A version of a container package, as GitHub's REST API gives it. */
export interface PackageVersion {
  readonly id: number;
  /** The manifest's digest, such as `sha256:…`. */
  readonly name: string;
  readonly created_at: string;
  readonly metadata: { readonly container: { readonly tags: readonly string[] } };
}

/** What to keep and what to delete. */
export interface Plan {
  readonly keep: readonly PackageVersion[];
  readonly delete: readonly PackageVersion[];
}

const tagsOf = (version: PackageVersion) => version.metadata.container.tags;
const newestFirst = (a: PackageVersion, b: PackageVersion) =>
  Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id;

/**
 * The tagged versions to keep: the newest `keep` releases (tagged `<major>.<minor>.<patch>`), and every version with
 * any other tag, such as `latest`, `0` or `0.5`, which someone may be pulling by.
 *
 * @throws {Error} If `keep` is less than 1.
 */
export function rootsToKeep(versions: readonly PackageVersion[], keep: number): PackageVersion[] {
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`KEEP must be a whole number of at least 1, not ${keep}`);
  const releases = versions.filter(version => tagsOf(version).some(tag => releaseTag.test(tag))).sort(newestFirst);
  const newest = new Set(releases.slice(0, keep));
  return versions.filter(version => newest.has(version) || tagsOf(version).some(tag => !releaseTag.test(tag)));
}

/**
 * Plans the pruning, given the digests each kept tagged version is made of (an index's platform images and
 * attestations; none for a single-platform image).
 *
 * @throws {Error} If what a kept version is made of is not given.
 */
export function plan(
  versions: readonly PackageVersion[],
  keep: number,
  childrenOf: ReadonlyMap<string, readonly string[]>,
  now: number,
): Plan {
  const roots = new Set(rootsToKeep(versions, keep));
  const referenced = new Set<string>();
  for (const root of roots) {
    const children = childrenOf.get(root.name);
    if (children === undefined) throw new Error(`what ${root.name} is made of was not read`);
    for (const child of children) referenced.add(child);
  }
  const kept = (version: PackageVersion) =>
    roots.has(version) ||
    referenced.has(version.name) ||
    (tagsOf(version).length === 0 && now - Date.parse(version.created_at) < settleMs);
  return {
    keep: versions.filter(kept).sort(newestFirst),
    delete: versions.filter(version => !kept(version)).sort(newestFirst),
  };
}

/** The image's manifest media types the registry is asked for: indexes and single-platform images. */
const manifestTypes = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

const isIndex = (value: unknown): value is { manifests: { digest: string }[] } =>
  typeof value === 'object' &&
  value !== null &&
  'manifests' in value &&
  Array.isArray(value.manifests) &&
  value.manifests.every(
    (entry: unknown) =>
      typeof entry === 'object' && entry !== null && 'digest' in entry && typeof entry.digest === 'string',
  );

/** The environment the script reads. */
export interface Env {
  readonly GITHUB_TOKEN?: string | undefined;
  readonly GITHUB_REPOSITORY?: string | undefined;
  readonly KEEP?: string | undefined;
  readonly DRY_RUN?: string | undefined;
}

/**
 * Prunes the image named after the repository (`ghcr.io/<owner>/<name>`, an organisation's package), returning a
 * Markdown report. With `DRY_RUN=true` it only reports what it would delete.
 *
 * @throws {Error} If the environment is incomplete, or GitHub or the registry refuses a request.
 */
export async function run(env: Env, fetch: typeof globalThis.fetch, now = Date.now()): Promise<string> {
  const token = env.GITHUB_TOKEN;
  const [owner, name] = (env.GITHUB_REPOSITORY ?? '').toLowerCase().split('/');
  if (!token || !owner || !name) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY (owner/name) are needed');
  const keep = Number(env.KEEP ?? '10');
  const dryRun = env.DRY_RUN === 'true';

  const api = `https://api.github.com/orgs/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(name)}`;
  const apiHeaders = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  const versions: PackageVersion[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`${api}/versions?per_page=100&page=${page}`, { headers: apiHeaders });
    if (!response.ok) throw new Error(`listing the image's versions: ${response.status} ${await response.text()}`);
    const batch = (await response.json()) as PackageVersion[];
    versions.push(...batch);
    if (batch.length < 100) break;
  }

  // The registry's own token, for reading manifests, exchanged for the workflow's.
  const exchange = await fetch(`https://ghcr.io/token?service=ghcr.io&scope=repository:${owner}/${name}:pull`, {
    headers: { authorization: `Basic ${btoa(`token:${token}`)}` },
  });
  if (!exchange.ok) throw new Error(`signing in to the registry: ${exchange.status}`);
  const { token: registryToken } = (await exchange.json()) as { token: string };

  const childrenOf = new Map<string, readonly string[]>();
  for (const root of rootsToKeep(versions, keep)) {
    const response = await fetch(`https://ghcr.io/v2/${owner}/${name}/manifests/${root.name}`, {
      headers: { authorization: `Bearer ${registryToken}`, accept: manifestTypes },
    });
    if (!response.ok) throw new Error(`reading ${root.name} (${tagsOf(root).join(', ')}): ${response.status}`);
    const manifest: unknown = await response.json();
    childrenOf.set(root.name, isIndex(manifest) ? manifest.manifests.map(entry => entry.digest) : []);
  }

  const { keep: kept, delete: deleted } = plan(versions, keep, childrenOf, now);
  if (!dryRun) {
    for (const version of deleted) {
      const response = await fetch(`${api}/versions/${version.id}`, { method: 'DELETE', headers: apiHeaders });
      if (!response.ok) throw new Error(`deleting ${version.name}: ${response.status} ${await response.text()}`);
    }
  }

  const describe = (version: PackageVersion) =>
    `| ${tagsOf(version).join(', ') || '(untagged)'} | \`${version.name.slice(0, 19)}\` | ${version.created_at} |`;
  return [
    `### Container image versions${dryRun ? ' (dry run)' : ''}`,
    '',
    `Kept ${kept.length}, ${dryRun ? 'would delete' : 'deleted'} ${deleted.length}, keeping the newest ${keep} releases.`,
    '',
    ...(deleted.length > 0
      ? [
          `| ${dryRun ? 'Would delete' : 'Deleted'} | Digest | Created |`,
          '| --- | --- | --- |',
          ...deleted.map(describe),
          '',
        ]
      : []),
  ].join('\n');
}

/* v8 ignore start -- process wiring */
if (import.meta.main) {
  process.stdout.write(await run(process.env, globalThis.fetch));
}
/* v8 ignore stop */
