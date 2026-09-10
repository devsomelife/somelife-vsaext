// Turns the lcov report from `node --test --experimental-test-coverage` into a
// Markdown table for the GitHub job summary.
//
// Node only reports files that the tests actually load, so a source file with
// no test would silently disappear from its report. Every shipped source file
// is listed here, and the ones never loaded are shown as not measured rather
// than left out, so the percentages cannot look better than they are.
//
// Usage: node .github/scripts/coverage-summary.mjs lcov.info

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

// Code worth measuring: the extension sources, plus the Office Script core
// that has its own tests. The Office Script glue only runs inside Excel.
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = join(dir, name);
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (rel.endsWith('.js')) out.push(rel.split(sep).join('/'));
    }
  };
  walk('src');
  out.push('tools/cra-import/logic.ts');
  return out.sort();
}

// Node writes SF paths relative to the directory the tests ran in, which is
// where lcov.info is written, so they are resolved against that file.
function parseLcov(text, base) {
  const files = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const [key, ...rest] = line.trim().split(':');
    const value = rest.join(':');
    if (key === 'SF') {
      current = { lf: 0, lh: 0, fnf: 0, fnh: 0, brf: 0, brh: 0 };
      files.set(relative(ROOT, resolve(base, value)).split(sep).join('/'), current);
    } else if (current && ['LF', 'LH', 'FNF', 'FNH', 'BRF', 'BRH'].includes(key)) {
      current[key.toLowerCase()] = Number(value);
    } else if (key === 'end_of_record') {
      current = null;
    }
  }
  return files;
}

const pct = (hit, found) => (found ? `${((100 * hit) / found).toFixed(1)}%` : 'n/a');

const lcovPath = process.argv[2];
if (!lcovPath) {
  console.error('usage: coverage-summary.mjs <lcov.info>');
  process.exit(1);
}

const report = parseLcov(readFileSync(lcovPath, 'utf8'), dirname(resolve(lcovPath)));
const sources = sourceFiles();
const measured = sources.filter((f) => report.has(f));
const unmeasured = sources.filter((f) => !report.has(f));

const total = { lf: 0, lh: 0, fnf: 0, fnh: 0, brf: 0, brh: 0 };
for (const f of measured) for (const k of Object.keys(total)) total[k] += report.get(f)[k];

const rows = [
  '## Code Coverage',
  '',
  '| File | Lines | Functions | Branches |',
  '| --- | ---: | ---: | ---: |',
  ...measured.map((f) => {
    const c = report.get(f);
    return `| \`${f}\` | ${pct(c.lh, c.lf)} | ${pct(c.fnh, c.fnf)} | ${pct(c.brh, c.brf)} |`;
  }),
  ...unmeasured.map((f) => `| \`${f}\` | not measured | not measured | not measured |`),
  `| **Measured files** | **${pct(total.lh, total.lf)}** | **${pct(total.fnh, total.fnf)}** | **${pct(total.brh, total.brf)}** |`,
  '',
  `${measured.length} of ${sources.length} source files are loaded by a test. The totals above cover those files only.`,
];
console.log(rows.join('\n'));
