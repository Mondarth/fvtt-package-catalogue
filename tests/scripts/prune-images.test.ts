import { describe, expect, it, vi } from 'vitest';
import { plan, rootsToKeep, run, type PackageVersion } from '../../scripts/prune-images.js';

const now = Date.parse('2026-11-15T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();

let nextId = 1;
const version = (name: string, tags: string[], hours: number): PackageVersion => ({
  id: nextId++,
  name,
  created_at: hoursAgo(hours),
  metadata: { container: { tags } },
});

/**
 * Three releases, each a multi-platform index (tagged) with an amd64 image, an arm64 image and an attestation
 * (untagged), and an orphan left from an earlier deletion. 0.3.0 carries the moving tags.
 */
function registry() {
  nextId = 1;
  const release = (v: string, hours: number, moving: string[] = []) => ({
    index: version(`sha256:index-${v}`, [v, ...moving], hours),
    children: [
      version(`sha256:amd64-${v}`, [], hours),
      version(`sha256:arm64-${v}`, [], hours),
      version(`sha256:attest-${v}`, [], hours),
    ],
  });
  const releases = [
    release('0.1.0', 300),
    release('0.2.0', 200, ['0.2']),
    release('0.3.0', 100, ['0.3', '0', 'latest']),
  ];
  const orphan = version('sha256:orphan', [], 400);
  const versions = [...releases.flatMap(r => [r.index, ...r.children]), orphan];
  const childrenOf = new Map(releases.map(r => [r.index.name, r.children.map(c => c.name)]));
  return { versions, childrenOf };
}

const names = (versions: readonly PackageVersion[]) => versions.map(v => v.name).sort();

describe('rootsToKeep', () => {
  it('keeps the newest releases and every version a moving tag names', () => {
    const { versions } = registry();
    // 0.2.0 is kept for its 0.2 line, though only the newest release is asked for.
    expect(names(rootsToKeep(versions, 1))).toEqual(['sha256:index-0.2.0', 'sha256:index-0.3.0']);
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses to keep %s releases', keep => {
    expect(() => rootsToKeep(registry().versions, keep)).toThrow(/KEEP/);
  });
});

describe('plan', () => {
  it('deletes the older releases with what they are made of, and orphans, keeping what the kept ones are made of', () => {
    const { versions, childrenOf } = registry();
    const { keep, delete: deleted } = plan(versions, 1, childrenOf, now);
    expect(names(deleted)).toEqual([
      'sha256:amd64-0.1.0',
      'sha256:arm64-0.1.0',
      'sha256:attest-0.1.0',
      'sha256:index-0.1.0',
      'sha256:orphan',
    ]);
    expect(keep).toHaveLength(8);
  });

  it('deletes nothing when every release is kept but the orphan', () => {
    const { versions, childrenOf } = registry();
    expect(names(plan(versions, 10, childrenOf, now).delete)).toEqual(['sha256:orphan']);
  });

  it('keeps a manifest two kept images share', () => {
    const { versions, childrenOf } = registry();
    childrenOf.set('sha256:index-0.3.0', [...(childrenOf.get('sha256:index-0.3.0') ?? []), 'sha256:amd64-0.1.0']);
    expect(names(plan(versions, 1, childrenOf, now).delete)).not.toContain('sha256:amd64-0.1.0');
  });

  it('leaves untagged manifests of the last hour alone, as they may be an image still being pushed', () => {
    const { versions, childrenOf } = registry();
    const pushing = version('sha256:pushing', [], 0.5);
    expect(names(plan([...versions, pushing], 1, childrenOf, now).keep)).toContain('sha256:pushing');
  });

  it('stops when what a kept version is made of was not read', () => {
    const { versions, childrenOf } = registry();
    childrenOf.delete('sha256:index-0.3.0');
    expect(() => plan(versions, 1, childrenOf, now)).toThrow(/sha256:index-0\.3\.0/);
  });
});

describe('run', () => {
  const env = { GITHUB_TOKEN: 't0ken', GITHUB_REPOSITORY: 'Mondarth/fvtt-package-catalogue', KEEP: '1' };
  const api = 'https://api.github.com/orgs/mondarth/packages/container/fvtt-package-catalogue';

  /** A GitHub API and registry holding registry() above; the manifest named in `failManifest` is refused. */
  function server(options: { failManifest?: string } = {}) {
    const { versions, childrenOf } = registry();
    const calls: string[] = [];
    const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => Promise.resolve(answer(input, init)));
    function answer(input: string | URL | Request, init?: RequestInit): Response {
      const url = input instanceof Request ? input.url : input.toString();
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url}`);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.startsWith(`${api}/versions?`)) {
        const page = Number(new URL(url).searchParams.get('page'));
        return json(page === 1 ? versions : []);
      }
      if (url.startsWith('https://ghcr.io/token')) {
        expect(new Headers(init?.headers).get('authorization')).toBe(`Basic ${btoa('token:t0ken')}`);
        return json({ token: 'registry-token' });
      }
      const manifest = /\/manifests\/(.+)$/.exec(url)?.[1];
      if (manifest !== undefined) {
        if (manifest === options.failManifest) return new Response('denied', { status: 403 });
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer registry-token');
        return json({ manifests: (childrenOf.get(manifest) ?? []).map(digest => ({ digest })) });
      }
      if (method === 'DELETE') return new Response(null, { status: 204 });
      throw new Error(`unexpected ${method} ${url}`);
    }
    const deleted = () =>
      calls
        .filter(call => call.startsWith('DELETE'))
        .map(call => Number(call.split('/').pop()))
        .map(id => versions.find(v => v.id === id)?.name)
        .sort();
    return { fetch, calls, deleted };
  }

  it('deletes the versions the plan deletes, by their ids', async () => {
    const { fetch, deleted } = server();
    const report = await run(env, fetch, now);
    expect(deleted()).toEqual([
      'sha256:amd64-0.1.0',
      'sha256:arm64-0.1.0',
      'sha256:attest-0.1.0',
      'sha256:index-0.1.0',
      'sha256:orphan',
    ]);
    expect(report).toContain('Kept 8, deleted 5, keeping the newest 1 releases.');
  });

  it('deletes nothing in a dry run, reporting what it would delete', async () => {
    const { fetch, calls } = server();
    const report = await run({ ...env, DRY_RUN: 'true' }, fetch, now);
    expect(calls.filter(call => call.startsWith('DELETE'))).toEqual([]);
    expect(report).toContain('(dry run)');
    expect(report).toContain('would delete 5');
    expect(report).toContain('| 0.1.0 | `sha256:index-0.1.0` |');
  });

  it('deletes nothing when what a kept version is made of cannot be read', async () => {
    const { fetch, calls } = server({ failManifest: 'sha256:index-0.3.0' });
    await expect(run(env, fetch, now)).rejects.toThrow(/sha256:index-0\.3\.0 \(0\.3\.0, 0\.3, 0, latest\): 403/);
    expect(calls.filter(call => call.startsWith('DELETE'))).toEqual([]);
  });

  it('keeps ten releases unless told otherwise', async () => {
    const { fetch } = server();
    expect(await run({ ...env, KEEP: undefined }, fetch, now)).toContain('keeping the newest 10 releases');
  });

  it('needs a token and a repository', async () => {
    await expect(run({ GITHUB_REPOSITORY: 'a/b' }, server().fetch, now)).rejects.toThrow(/GITHUB_TOKEN/);
    await expect(run({ GITHUB_TOKEN: 't' }, server().fetch, now)).rejects.toThrow(/GITHUB_REPOSITORY/);
  });
});
