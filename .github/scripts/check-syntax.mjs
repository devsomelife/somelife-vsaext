// Syntax-checks every JavaScript file.
//
// `node --check` parses as CommonJS, which silently accepts some module files.
// Anything using import/export is copied to a .mjs first so it is checked as a
// module, matching how Chrome actually loads it.
//
// Every file is checked before exiting, so one failure does not hide the rest.

import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOTS = ['src', 'tools', '.github/scripts'];
const MODULE_RE = /^\s*(import|export)\s/m;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (['.js', '.mjs'].includes(extname(path))) out.push(path);
  }
  return out;
}

const scratch = mkdtempSync(join(tmpdir(), 'syntax-'));
let failed = 0;

try {
  for (const file of ROOTS.flatMap(walk).sort()) {
    const source = readFileSync(file, 'utf8');
    const isModule = MODULE_RE.test(source);

    let target = file;
    if (isModule) {
      target = join(scratch, 'check.mjs');
      writeFileSync(target, source);
    }

    try {
      execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
      console.log(`  ok   (${isModule ? 'esm' : 'script'}) ${file}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL (${isModule ? 'esm' : 'script'}) ${file}`);
      const detail = String(err.stderr || '').split('\n').slice(0, 4).join('\n');
      console.log(detail.replace(/^/gm, '       '));
      console.log(`::error file=${file}::syntax error`);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
