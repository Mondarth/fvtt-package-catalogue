/**
 * Prints a coverage summary (the `json-summary` format written by Vitest and by
 * monocart-coverage-reports) as a Markdown table, for CI job summaries.
 *
 *   node scripts/coverage-summary.ts <coverage-summary.json> <title>
 */
import { readFileSync } from 'node:fs';

const metrics = ['statements', 'branches', 'functions', 'lines'] as const;

/** One coverage metric. */
export interface Metric {
  readonly total: number;
  readonly covered: number;
  readonly pct: number | string;
}

/** The totals of a coverage summary. */
export type Totals = Record<(typeof metrics)[number], Metric>;

const isMetric = (value: unknown): value is Metric =>
  typeof value === 'object' && value !== null && 'total' in value && 'covered' in value && 'pct' in value;

/** Narrows parsed JSON to a coverage summary with totals for every metric. */
export function isSummary(value: unknown): value is { total: Totals } {
  if (typeof value !== 'object' || value === null || !('total' in value)) return false;
  const { total } = value;
  return typeof total === 'object' && total !== null && metrics.every(metric => isMetric(Reflect.get(total, metric)));
}

/** Formats the totals as a Markdown section. */
export function toMarkdown(title: string, total: Totals): string {
  return [
    `### ${title}`,
    '',
    '| Metric | Coverage | Covered |',
    '| --- | ---: | ---: |',
    ...metrics.map(
      metric => `| ${metric} | ${total[metric].pct}% | ${total[metric].covered} / ${total[metric].total} |`,
    ),
    '',
  ].join('\n');
}

/**
 * Reads the summary named in `argv` and returns it as Markdown.
 *
 * @throws {Error} If no file is given or the file is not a coverage summary.
 */
export function run(argv: readonly string[], readFile: (path: string) => string): string {
  const [file, title = 'Coverage'] = argv;
  if (file === undefined) throw new Error('usage: coverage-summary.ts <coverage-summary.json> [title]');
  const summary: unknown = JSON.parse(readFile(file));
  if (!isSummary(summary)) throw new Error(`${file} is not a coverage summary`);
  return toMarkdown(title, summary.total);
}

/* v8 ignore start -- process wiring */
if (import.meta.main) {
  process.stdout.write(run(process.argv.slice(2), path => readFileSync(path, 'utf8')));
}
/* v8 ignore stop */
