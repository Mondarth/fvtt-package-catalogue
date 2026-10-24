import { describe, expect, it } from 'vitest';
import { isSummary, run, toMarkdown, type Totals } from '../../scripts/coverage-summary.js';

const total: Totals = {
  statements: { total: 200, covered: 190, pct: 95 },
  branches: { total: 50, covered: 45, pct: 90 },
  functions: { total: 40, covered: 40, pct: 100 },
  lines: { total: 180, covered: 171, pct: 95 },
};

describe('isSummary', () => {
  it('accepts a summary with every metric', () => {
    expect(isSummary({ total, 'src/x.ts': {} })).toBe(true);
  });

  it.each([
    ['null', null],
    ['an object without totals', {}],
    ['null totals', { total: null }],
    ['missing metrics', { total: { lines: total.lines } }],
    ['malformed metrics', { total: { ...total, lines: { pct: 1 } } }],
  ])('rejects %s', (_label, value) => {
    expect(isSummary(value)).toBe(false);
  });
});

describe('toMarkdown', () => {
  it('formats the totals as a titled table', () => {
    expect(toMarkdown('Unit coverage', total)).toBe(
      [
        '### Unit coverage',
        '',
        '| Metric | Coverage | Covered |',
        '| --- | ---: | ---: |',
        '| statements | 95% | 190 / 200 |',
        '| branches | 90% | 45 / 50 |',
        '| functions | 100% | 40 / 40 |',
        '| lines | 95% | 171 / 180 |',
        '',
      ].join('\n'),
    );
  });
});

describe('run', () => {
  const files: Record<string, string> = {
    'summary.json': JSON.stringify({ total }),
    'other.json': JSON.stringify({ hello: 'world' }),
  };
  const readFile = (path: string): string => files[path] ?? '';

  it('formats the named summary under the given title', () => {
    expect(run(['summary.json', 'E2E coverage'], readFile)).toMatch(/^### E2E coverage\n/);
  });

  it('defaults the title', () => {
    expect(run(['summary.json'], readFile)).toMatch(/^### Coverage\n/);
  });

  it('requires a file', () => {
    expect(() => run([], readFile)).toThrow(/^usage:/);
  });

  it('rejects a file that is not a coverage summary', () => {
    expect(() => run(['other.json'], readFile)).toThrow('other.json is not a coverage summary');
  });
});
