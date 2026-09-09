// Validates the extension manifest and that every file it references exists.
//
// Chrome fails silently on a missing content script or icon, so this catches
// the class of mistake that would otherwise only show up when loading the
// extension by hand.
//
// Usage:
//   node validate-manifest.mjs            check the working tree
//   node validate-manifest.mjs --zip f    check inside a built zip

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, posix } from 'node:path';

const zipIndex = process.argv.indexOf('--zip');
const zip = zipIndex === -1 ? null : process.argv[zipIndex + 1];

let read;
let has;

if (zip) {
  const listing = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const entries = new Set(listing);
  has = (p) => entries.has(p);
  read = (p) => execFileSync('unzip', ['-p', zip, p], { encoding: 'utf8' });
} else {
  has = (p) => existsSync(p);
  read = (p) => readFileSync(p, 'utf8');
}

const errors = [];
const check = (path, what) => {
  if (!has(path)) errors.push(`${what}: missing ${path}`);
};

if (!has('manifest.json')) {
  console.error('manifest.json not found at the root');
  process.exit(1);
}

const manifest = JSON.parse(read('manifest.json'));

if (manifest.manifest_version !== 3) {
  errors.push(`manifest_version must be 3, found ${manifest.manifest_version}`);
}
for (const field of ['name', 'version']) {
  if (!manifest[field]) errors.push(`manifest is missing "${field}"`);
}
if (manifest.version && !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
  errors.push(`version "${manifest.version}" is not a valid Chrome version string`);
}

if (manifest.background?.service_worker) {
  check(manifest.background.service_worker, 'background.service_worker');
}
if (manifest.options_page) check(manifest.options_page, 'options_page');

for (const [i, cs] of (manifest.content_scripts ?? []).entries()) {
  for (const f of [...(cs.js ?? []), ...(cs.css ?? [])]) {
    check(f, `content_scripts[${i}]`);
  }
  if (!cs.matches?.length) errors.push(`content_scripts[${i}] has no matches`);
}

for (const [size, path] of Object.entries(manifest.icons ?? {})) {
  check(path, `icons[${size}]`);
}
for (const [size, path] of Object.entries(manifest.action?.default_icon ?? {})) {
  check(path, `action.default_icon[${size}]`);
}

// Local assets referenced from the options page.
if (manifest.options_page && has(manifest.options_page)) {
  const html = read(manifest.options_page);
  const base = dirname(manifest.options_page);
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|data:|#)/.test(ref)) continue;
    check(posix.normalize(join(base, ref)), 'options_page asset');
  }
}

const where = zip ? `zip ${zip}` : 'working tree';
if (errors.length) {
  console.error(`FAIL (${where})`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK (${where}): ${manifest.name} ${manifest.version}, manifest v3`);
