import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * GitHub Pages names a deployment after its commit, so a re-run of a stalled deployment needs an
 * artifact of its own, and publishing again needs a manual run (lessons from pdt's releases).
 */

interface Step {
  name?: string;
  if?: string;
  uses?: string;
  'timeout-minutes'?: number;
  run?: string;
  with?: Record<string, string>;
}

interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, { if?: string; uses?: string; steps?: Step[]; strategy?: { matrix?: { project?: string[] } } }>;
}

const read = (name: string) => parse(readFileSync(`.github/workflows/${name}`, 'utf8')) as Workflow;
const workflow = read('release.yml');

/** The `with` inputs of the pages job's step that uses the given action. */
function inputsOf(action: string): Record<string, string> {
  const step = workflow.jobs.pages?.steps?.find(candidate => candidate.uses?.startsWith(`${action}@`));
  if (step === undefined) throw new Error(`the pages job does not use ${action}`);
  return step.with ?? {};
}

describe('release workflow', () => {
  it('can be started by hand', () => {
    expect(workflow.on).toHaveProperty('workflow_dispatch');
  });

  it('runs CI and the end-to-end tests only on main, whichever way it is started', () => {
    expect(workflow.jobs.ci?.if).toBe("github.ref == 'refs/heads/main'");
    expect(workflow.jobs.e2e?.if).toBe("github.ref == 'refs/heads/main'");
  });

  it('gives each attempt its own Pages artifact', () => {
    const uploaded = inputsOf('actions/upload-pages-artifact').name;
    expect(uploaded).toContain('${{ github.run_attempt }}');
    expect(inputsOf('actions/deploy-pages').artifact_name).toBe(uploaded);
  });
});

describe('docs workflow', () => {
  const docs = read('docs.yml');

  it('takes no ref to check out', () => {
    expect(docs.on.workflow_call ?? {}).not.toHaveProperty('inputs.ref');
  });

  it('shares its build steps with the Pages job', () => {
    expect(docs.jobs.build?.steps?.map(step => step.uses)).toContain('./.github/actions/build-docs');
    expect(workflow.jobs.pages?.steps?.map(step => step.uses)).toContain('./.github/actions/build-docs');
  });
});

describe('e2e workflow', () => {
  const e2e = read('e2e.yml');
  const config = readFileSync('packages/catalogue/tests/e2e/playwright.config.ts', 'utf8');

  it('runs on pull requests to dev as well as main, and on pushes to dev', () => {
    expect(e2e.on).toMatchObject({ pull_request: { branches: ['dev', 'main'] }, push: { branches: ['dev'] } });
  });

  it("runs every one of Playwright's projects", () => {
    const projects = [...config.matchAll(/name: '([\w-]+)'/g)].map(match => match[1]);
    expect(e2e.jobs.e2e?.strategy?.matrix?.project).toEqual(projects);
  });

  // Regression: the runner's Ubuntu mirror stalled the install's apt downloads for over ten minutes, twice in an hour,
  // until the job's own timeout or a hand cancelled it. An install that stalls is stopped and tried once more.
  it('gives up installing the browser after five minutes, and tries once more', () => {
    const install = e2e.jobs.e2e?.steps?.find(step => step.name === 'Install the browser');
    expect(install?.run).toMatch(/for attempt in 1 2\b/);
    expect(install?.run).toMatch(/\btimeout\b.* 5m pnpm exec playwright install --with-deps/);
    // A backstop above both attempts, should the loop itself hang.
    expect(install?.['timeout-minutes']).toBe(12);
  });

  /**
   * The install step's script, run as Actions runs it (`bash -e`), with `timeout` and `sudo` standing in: `timeout`
   * exits with each status given in turn, as a stalled or a finished install; `sudo dpkg` fails, as it does while the
   * apt-get that `timeout` could not reach holds dpkg's lock. What each ran is returned.
   */
  function runInstall(statuses: number[]): { status: number | null; ran: string[] } {
    const install = e2e.jobs.e2e?.steps?.find(step => step.name === 'Install the browser');
    const script = (install?.run ?? '').replaceAll('${{ matrix.project }}', 'firefox');
    const dir = mkdtempSync(join(tmpdir(), 'install-step-'));
    try {
      const log = join(dir, 'ran.log');
      const stub = (name: string, body: string) => {
        writeFileSync(join(dir, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
        chmodSync(join(dir, name), 0o755);
      };
      writeFileSync(join(dir, 'statuses'), statuses.join('\n') + '\n');
      stub('timeout', `status=$(head -n 1 "${dir}/statuses"); sed -i 1d "${dir}/statuses"; exit "$status"`);
      stub('sudo', 'case "$1" in dpkg) exit 2 ;; esac; exit 0');
      // No apt-get left running, once it has been stopped.
      stub('pgrep', 'exit 1');
      const run = spawnSync('bash', ['-e', '-c', script], { env: { PATH: `${dir}:${process.env.PATH ?? ''}` } });
      const ran = readFileSync(log, 'utf8').trim().split('\n');
      return { status: run.status, ran };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Regression: the first attempt was stopped on time, but `sudo` runs apt-get in a session of its own, beyond
  // `timeout`'s reach, so it kept dpkg's lock; `dpkg --configure -a` then failed, and `bash -e` ended the step there.
  it('tries again after a stalled install, stopping the apt-get it leaves behind', () => {
    const { status, ran } = runInstall([124, 0]);
    expect(status).toBe(0);
    expect(ran.filter(line => line.startsWith('timeout'))).toHaveLength(2);
    expect(ran).toContain('sudo pkill -TERM -x apt-get');
    expect(ran.indexOf('sudo pkill -TERM -x apt-get')).toBeLessThan(ran.indexOf('sudo dpkg --configure -a'));
  });

  it('installs once when the first try works', () => {
    const { status, ran } = runInstall([0]);
    expect(status).toBe(0);
    expect(ran).toEqual(['timeout --kill-after=30s 5m pnpm exec playwright install --with-deps firefox']);
  });

  it('fails the step when both tries stall', () => {
    expect(runInstall([124, 124]).status).toBe(1);
  });
});

describe.each(['api', 'worker'])("the %s project's end-to-end tests", project => {
  const dir = `packages/catalogue/tests/e2e/${project}`;

  // Regression: they used the website's fixtures, whose console guard launches a browser, and failed in CI, where the
  // api project installs none; nor does the worker's.
  it.each(readdirSync(dir).filter(file => file.endsWith('.spec.ts')))('%s needs no browser', file => {
    expect(readFileSync(`${dir}/${file}`, 'utf8')).not.toMatch(/from '\.\.\/fixtures\.js'/);
  });

  it('installs no browser in CI', () => {
    const install = read('e2e.yml').jobs.e2e?.steps?.find(step => step.name === 'Install the browser');
    expect(install?.if).toContain(`matrix.project != '${project}'`);
  });
});
