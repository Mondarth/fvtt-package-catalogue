import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

interface Service {
  image?: string;
  networks?: string[] | Record<string, { aliases?: string[] } | null>;
  ports?: string[];
  depends_on?: Record<string, { condition: string }>;
  read_only?: boolean;
}

interface Compose {
  name?: string;
  services: Record<string, Service>;
  networks?: Record<string, { internal?: boolean; external?: boolean; name?: string }>;
}

const files = [
  'deploy/compose.yaml',
  'packages/catalogue/compose.dev.yaml',
  'packages/catalogue/tests/e2e/compose.yaml',
  'docs/compose.yaml',
];
const read = (file: string) => parse(readFileSync(file, 'utf8')) as Compose;
const networksOf = (service: Service | undefined): string[] =>
  Array.isArray(service?.networks) ? service.networks : Object.keys(service?.networks ?? {});

describe.each(files)('%s', file => {
  /*
   * Regression: tests/e2e/compose.yaml took its directory's name, e2e, as its project, which another project on the
   * same machine (EMMA's end-to-end Foundry VTT server) also had. Its `down` could have stopped the other's containers.
   */
  it('names its project, uniquely to this repository', () => {
    expect(read(file).name).toMatch(/^fvtt-package-catalogue(?:-[a-z0-9]+)?$/);
  });
});

it('every compose file has a project name of its own', () => {
  const names = files.map(file => read(file).name);
  expect(new Set(names).size).toBe(names.length);
});

describe('the production deployment', () => {
  const compose = read('deploy/compose.yaml');
  const { app, db, migrate } = compose.services;

  it('runs the released image', () => {
    expect(app?.image).toBe('ghcr.io/mondarth/fvtt-package-catalogue:${CATALOGUE_TAG:-latest}');
    expect(migrate?.image).toBe(app?.image);
  });

  it("puts only the server on SWAG's network, reachable by its alias", () => {
    expect(compose.networks?.swag).toEqual({ external: true, name: '${SWAG_NETWORK:-swag_default}' });
    expect(app?.networks).toMatchObject({ swag: { aliases: ['fvtt-package-catalogue'] } });
    expect(networksOf(db)).toEqual(['database']);
    expect(networksOf(migrate)).toEqual(['database']);
  });

  it('keeps the database off every network with a way out', () => {
    expect(compose.networks?.database?.internal).toBe(true);
  });

  it('publishes nothing on the host', () => {
    expect(Object.values(compose.services).flatMap(service => service.ports ?? [])).toEqual([]);
  });

  it('starts the server only once the migration has succeeded', () => {
    expect(app?.depends_on).toEqual({ migrate: { condition: 'service_completed_successfully' } });
    expect(migrate?.depends_on).toEqual({ db: { condition: 'service_healthy' } });
  });

  it("matches SWAG's proxy configuration", () => {
    const conf = readFileSync('deploy/swag/fvtt-package-catalogue.subdomain.conf.sample', 'utf8');
    expect(conf).toContain('set $upstream_app fvtt-package-catalogue;');
    expect(conf).toContain('set $upstream_port 3000;');
  });
});
