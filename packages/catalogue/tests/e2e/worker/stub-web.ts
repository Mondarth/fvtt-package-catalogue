import { createServer } from 'node:http';

import type { AddressInfo } from 'node:net';

/** A package Foundry VTT's index lists, which needs another, found only by the manifest URL it declares. */
export const CRAWLED = { type: 'module', id: 'e2e-crawled' } as const;
export const NEEDED = { type: 'module', id: 'e2e-needed' } as const;

/** Foundry VTT's builds, as its release notes give them. */
export const STUB_BUILDS = [{ version: '14.369', generation: 14, channel: 'testing' }] as const;

/** The path of a version's manifest of the crawled package. */
export const manifestPath = (version: string) => `/e2e-crawled/${version}/module.json`;

/** The stub web: its address, what it has been asked for, and how to change and stop it. */
export interface StubWeb {
  readonly base: string;
  /** How many times each path was asked for. */
  readonly hits: ReadonlyMap<string, number>;
  /** Publishes a version of the crawled package, as its author would, changing the index's `last_updated`. */
  publish(version: string, lastUpdated: string): void;
  close(): Promise<void>;
}

/** What the web gives, by path, with the stub's own address where a file names another. */
function files(base: string, versions: readonly string[], lastUpdated: string): Record<string, unknown> {
  const needed = `${base}/e2e-needed/module.json`;
  const manifests = Object.fromEntries(
    versions.map(version => [
      manifestPath(version),
      {
        id: CRAWLED.id,
        title: 'E2E crawled',
        version,
        compatibility: { minimum: '13', verified: '14' },
        relationships: { requires: [{ id: NEEDED.id, type: 'module', manifest: needed }] },
        manifest: `${base}${manifestPath(version)}`,
        download: `${base}/e2e-crawled/${version}/module.zip`,
      },
    ]),
  );
  return {
    '/index-latest.json': {
      details: `${base}/detail/{id}.json`,
      packages: [{ id: CRAWLED.id, type: 'module', title: 'E2E crawled', last_updated: lastUpdated }],
    },
    '/detail/e2e-crawled.json': {
      versions: versions.map(version => ({
        version,
        manifest: `${base}${manifestPath(version)}`,
        minimum: '13',
        verified: '14',
      })),
    },
    ...manifests,
    '/e2e-needed/module.json': {
      id: NEEDED.id,
      title: 'E2E needed',
      version: '2.0.0',
      compatibility: { minimum: '12' },
      manifest: needed,
      download: `${base}/e2e-needed/module.zip`,
    },
    '/releases/': '<a href="/releases/14.369">Release 14.369</a> <span class="release-tag testing">Testing</span>',
  };
}

/**
 * A web server standing in for Foundry VTT and the packages' hosts, on a port of its own. The crawled package starts
 * with one version, 1.0.0.
 *
 * @returns The stub
 */
export async function stubWeb(): Promise<StubWeb> {
  let base = '';
  const versions = ['1.0.0'];
  let lastUpdated = '2026-10-01';
  const hits = new Map<string, number>();
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', base).pathname;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const found = files(base, versions, lastUpdated)[path];
    if (found === undefined) {
      response.writeHead(404).end();
    } else if (typeof found === 'string') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end(found);
    } else {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(found));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  return {
    base,
    hits,
    publish(version, updated) {
      // Newest first, as Foundry VTT lists them.
      versions.unshift(version);
      lastUpdated = updated;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
