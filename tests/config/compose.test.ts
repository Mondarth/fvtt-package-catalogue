import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

interface Service {
  image?: string;
  command?: string[];
  restart?: string;
  networks?: string[] | Record<string, { aliases?: string[] } | null>;
  ports?: string[];
  depends_on?: Record<string, { condition: string }>;
  read_only?: boolean;
  healthcheck?: { disable?: boolean; test?: unknown };
  environment?: Record<string, string>;
}

interface Compose {
  name?: string;
  services: Record<string, Service>;
  networks?: Record<string, { internal?: boolean; external?: boolean; name?: string }>;
}

const files = [
  'deploy/compose.yaml',
  'apps/catalogue/compose.dev.yaml',
  'apps/catalogue/tests/e2e/compose.yaml',
  'apps/accounts/compose.dev.yaml',
  'apps/accounts/tests/e2e/compose.yaml',
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
    expect(read(file).name).toMatch(/^(?:fvtt-package-catalogue|mondarth-accounts)(?:-[a-z0-9]+)?$/);
  });
});

it('every compose file has a project name of its own', () => {
  const names = files.map(file => read(file).name);
  expect(new Set(names).size).toBe(names.length);
});

describe('the production deployment', () => {
  const compose = read('deploy/compose.yaml');
  const {
    app,
    db,
    migrate,
    worker,
    accounts,
    'accounts-db': accountsDb,
    'accounts-migrate': accountsMigrate,
  } = compose.services;

  it('runs the released image', () => {
    expect(app?.image).toBe('ghcr.io/mondarth/fvtt-package-catalogue:${CATALOGUE_TAG:-latest}');
    expect(migrate?.image).toBe(app?.image);
    expect(worker?.image).toBe(app?.image);
  });

  it('runs the worker for good, once the migration has succeeded', () => {
    expect(worker?.command).toEqual(['node', 'build/worker/main.js', 'run']);
    expect(worker?.restart).toBe('unless-stopped');
    expect(worker?.depends_on).toEqual({ migrate: { condition: 'service_completed_successfully' } });
  });

  /*
   * Regression: the worker and the migration took the image's health check, which asks the server on its port. Neither
   * runs it, so Docker called the worker unhealthy a minute after it started, though it was crawling.
   */
  it('checks the health of the server only, which is what the image checks', () => {
    expect(app?.healthcheck).toBeUndefined();
    expect(worker?.healthcheck).toEqual({ disable: true });
    expect(migrate?.healthcheck).toEqual({ disable: true });
    expect(readFileSync('Dockerfile', 'utf8')).toMatch(/^HEALTHCHECK .*\/healthz/m);
  });

  // The worker fetches from Foundry VTT, GitHub and GitLab, and the server packages' own manifests, for rechecks;
  // nothing else needs a way out.
  it('gives only the worker and the two servers a way out, beside their databases', () => {
    expect(networksOf(worker).toSorted()).toEqual(['database', 'egress']);
    expect(networksOf(app).toSorted()).toEqual(['database', 'egress', 'internal', 'swag']);
    expect(networksOf(accounts).toSorted()).toEqual(['accounts-database', 'egress', 'internal', 'swag']);
    expect(compose.networks?.egress?.internal).toBeUndefined();
    const others = Object.entries(compose.services).filter(([name]) => !['worker', 'app', 'accounts'].includes(name));
    expect(others.filter(([, service]) => networksOf(service).includes('egress'))).toEqual([]);
  });

  it("lets the catalogue alone reach the accounts' internal API, on a network of the two, with its key", () => {
    expect(compose.networks?.internal?.internal).toBe(true);
    const onIt = Object.entries(compose.services).filter(([, service]) => networksOf(service).includes('internal'));
    expect(onIt.map(([name]) => name).toSorted()).toEqual(['accounts', 'app']);
    expect(app?.environment).toMatchObject({ ACCOUNTS_URL: 'http://accounts:3000' });
    expect(app?.environment?.ACCOUNTS_KEY).toBe(accounts?.environment?.INTERNAL_API_KEYS);
  });

  it('runs the accounts from their own image, with their own database, once their migration has succeeded', () => {
    expect(accounts?.image).toBe('ghcr.io/mondarth/accounts:${ACCOUNTS_TAG:-latest}');
    expect(accountsMigrate?.image).toBe(accounts?.image);
    expect(accountsMigrate?.command).toEqual(['node', 'build/migrate.js']);
    expect(accountsMigrate?.healthcheck).toEqual({ disable: true });
    expect(accounts?.depends_on).toEqual({ 'accounts-migrate': { condition: 'service_completed_successfully' } });
    expect(networksOf(accountsDb)).toEqual(['accounts-database']);
    expect(networksOf(accountsMigrate)).toEqual(['accounts-database']);
    expect(compose.networks?.['accounts-database']?.internal).toBe(true);
    expect(accounts?.networks).toMatchObject({ swag: { aliases: ['mondarth-accounts'] } });
    expect(readFileSync('apps/accounts/Dockerfile', 'utf8')).toMatch(/^HEALTHCHECK .*\/healthz/m);
  });

  it("puts only the servers on SWAG's network, the catalogue's reachable by its alias", () => {
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

  it('starts the server only once the migration has succeeded, and the accounts are up', () => {
    expect(app?.depends_on).toEqual({
      migrate: { condition: 'service_completed_successfully' },
      accounts: { condition: 'service_healthy' },
    });
    expect(migrate?.depends_on).toEqual({ db: { condition: 'service_healthy' } });
  });

  it("matches SWAG's proxy configuration", () => {
    const conf = readFileSync('deploy/swag/fvtt-package-catalogue.subdomain.conf.sample', 'utf8');
    expect(conf).toContain('set $upstream_app fvtt-package-catalogue;');
    expect(conf).toContain('set $upstream_port 3000;');
  });

  it("matches the accounts' SWAG configuration, which keeps their internal API off the web", () => {
    const conf = readFileSync('deploy/swag/mondarth-accounts.subdomain.conf.sample', 'utf8');
    expect(conf).toContain('set $upstream_app mondarth-accounts;');
    expect(conf).toContain('set $upstream_port 3000;');
    expect(conf).toMatch(/location \^~ \/internal \{\s*return 404;/);
  });
});
