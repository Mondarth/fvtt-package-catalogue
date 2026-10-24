import { readdirSync, readFileSync } from 'node:fs';
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
