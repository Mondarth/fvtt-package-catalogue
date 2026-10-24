import { createServer } from 'node:http';

import type { AddressInfo } from 'node:net';

/** A package Foundry VTT's index lists, which needs another, found only by the manifest URL it declares. */
export const CRAWLED = { type: 'module', id: 'e2e-crawled' } as const;
export const NEEDED = { type: 'module', id: 'e2e-needed' } as const;

/** Foundry VTT's builds, as its release notes give them. */
export const STUB_BUILDS = [{ version: '14.369', generation: 14, channel: 'testing' }] as const;

/** What the web gives, by path, with the stub's own address where a file names another. */
function files(base: string): Record<string, unknown> {
  const manifest = `${base}/e2e-crawled/1.0.0/module.json`;
  const needed = `${base}/e2e-needed/module.json`;
  return {
    '/index-latest.json': {
      details: `${base}/detail/{id}.json`,
      packages: [{ id: CRAWLED.id, type: 'module', last_updated: '2026-10-01' }],
    },
    '/detail/e2e-crawled.json': { versions: [{ version: '1.0.0', manifest, minimum: '13', verified: '14' }] },
    '/e2e-crawled/1.0.0/module.json': {
      id: CRAWLED.id,
      title: 'E2E crawled',
      version: '1.0.0',
      compatibility: { minimum: '13', verified: '14' },
      relationships: { requires: [{ id: NEEDED.id, type: 'module', manifest: needed }] },
      manifest,
      download: `${base}/e2e-crawled/1.0.0/module.zip`,
    },
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
 * A web server standing in for Foundry VTT and the packages' hosts, on a port of its own.
 *
 * @returns Its address, and how to stop it
 */
export async function stubWeb(): Promise<{ base: string; close: () => Promise<void> }> {
  let base = '';
  const server = createServer((request, response) => {
    const found = files(base)[new URL(request.url ?? '/', base).pathname];
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
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
