// Validates an extension manifest and that every file it references exists.
//
// Browsers fail silently on a missing content script or icon, so this catches
// the class of mistake that would otherwise only show up when loading the
// extension by hand. The Chrome/Edge and Firefox packages differ in how the
// background runs and in Firefox-only settings, so each target adds its own
// rules to the shared ones.
//
// Usage:
//   node validate-manifest.mjs                                     working tree (Chrome manifest and Firefox overlay)
//   node validate-manifest.mjs --target chrome --zip <file.zip>    a built package
//   node validate-manifest.mjs --target firefox --dir build/firefox

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, posix } from 'node:path';

const TARGETS = ['chrome', 'firefox'];
const argument = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

const zip = argument('--zip');
const dir = argument('--dir');
const target = argument('--target') ?? 'chrome';

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!TARGETS.includes(target)) fail(`unknown --target "${target}", expected ${TARGETS.join(' or ')}`);
if (zip && dir) fail('use either --zip or --dir, not both');
if (target === 'firefox' && !zip && !dir) {
  fail('the Firefox manifest is generated: build it, then pass --dir build/firefox or --zip <file>');
}

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
} else if (dir) {
  has = (p) => existsSync(join(dir, p));
  read = (p) => readFileSync(join(dir, p), 'utf8');
} else {
  has = (p) => existsSync(p);
  read = (p) => readFileSync(p, 'utf8');
}

const errors = [];
const check = (path, what) => {
  if (!has(path)) errors.push(`${what}: missing ${path}`);
};

if (!has('manifest.json')) fail('manifest.json not found at the root');

const manifest = JSON.parse(read('manifest.json'));

// ---- Shared rules ------------------------------------------------------------

if (manifest.manifest_version !== 3) {
  errors.push(`manifest_version must be 3, found ${manifest.manifest_version}`);
}
for (const field of ['name', 'version']) {
  if (!manifest[field]) errors.push(`manifest is missing "${field}"`);
}
if (manifest.version && !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
  errors.push(`version "${manifest.version}" is not a valid extension version string`);
}

const background = manifest.background ?? {};
if (background.service_worker) check(background.service_worker, 'background.service_worker');
for (const file of background.scripts ?? []) check(file, 'background.scripts');
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

// ---- Target rules ------------------------------------------------------------

if (target === 'chrome') {
  // Chrome ignores background.scripts in MV3, but the Edge store rejects it.
  if (background.scripts) errors.push('background.scripts is not allowed in a Chrome/Edge MV3 manifest');
  if (manifest.browser_specific_settings) errors.push('browser_specific_settings belongs to the Firefox build only');
  if (manifest.background && !background.service_worker) {
    errors.push('background.service_worker is required for Chrome/Edge');
  }
} else {
  if (background.service_worker) {
    errors.push('background.service_worker is not supported by Firefox, use background.scripts');
  }
  if (!Array.isArray(background.scripts) || !background.scripts.length) {
    errors.push('background.scripts is required for Firefox');
  }
  const gecko = manifest.browser_specific_settings?.gecko ?? {};
  const EMAIL_ID = /^[\w.-]+@[\w.-]+$/;
  const GUID_ID = /^\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}$/;
  if (!EMAIL_ID.test(gecko.id ?? '') && !GUID_ID.test(gecko.id ?? '')) {
    errors.push(`gecko.id "${gecko.id ?? ''}" is missing or is not an email-like or {GUID} add-on id`);
  }
  // data_collection_permissions, required on AMO, needs Firefox 140.
  const major = Number(String(gecko.strict_min_version ?? '').split('.')[0]);
  if (!(major >= 140)) {
    errors.push(`gecko.strict_min_version must be 140 or later, found "${gecko.strict_min_version ?? ''}"`);
  }
  const required = gecko.data_collection_permissions?.required;
  if (!Array.isArray(required) || !required.length) {
    errors.push('gecko.data_collection_permissions.required must list the data collected, or "none"');
  }
}

// The Firefox overlay must never carry what comes from manifest.json.
if (!zip && !dir && existsSync('manifest.firefox.json')) {
  const overlay = JSON.parse(readFileSync('manifest.firefox.json', 'utf8'));
  for (const key of ['manifest_version', 'name', 'version']) {
    if (key in overlay) errors.push(`manifest.firefox.json must not set "${key}", it comes from manifest.json`);
  }
}

const where = zip ? `zip ${zip}` : dir ? `dir ${dir}` : 'working tree';
if (errors.length) {
  console.error(`FAIL (${where}, ${target})`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const kind = background.service_worker ? 'service worker' : background.scripts ? 'background scripts' : 'no background';
console.log(`OK (${where}, ${target}): ${manifest.name} ${manifest.version}, manifest v3, ${kind}`);
