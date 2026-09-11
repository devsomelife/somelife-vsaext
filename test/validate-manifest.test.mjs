import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeManifest } from '../.github/scripts/build-extension.mjs';

const SCRIPT = fileURLToPath(new URL('../.github/scripts/validate-manifest.mjs', import.meta.url));
const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const chrome = read('../manifest.json');
const firefox = mergeManifest(chrome, read('../manifest.firefox.json'));

// Only file existence is checked, so the referenced files can be empty.
const FILES = {
  'src/background.js': '',
  'src/options/options.html': '<link rel="stylesheet" href="options.css"><script type="module" src="options.js"></script>',
  'src/options/options.css': '',
  'src/options/options.js': '',
  'icons/icon16.png': '',
  'icons/icon48.png': '',
  'icons/icon128.png': '',
};

// Runs the validator on a throwaway package folder holding `manifest`.
function validate(target, manifest) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-manifest-'));
  try {
    for (const [rel, body] of Object.entries(FILES)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    const out = execFileSync(process.execPath, [SCRIPT, '--target', target, '--dir', dir], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: String(err.stderr) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the chrome manifest passes the chrome rules', () => {
  const r = validate('chrome', chrome);
  assert.equal(r.ok, true, r.out);
  assert.match(r.out, /chrome\): VSA Ext .*service worker/);
});

test('the generated firefox manifest passes the firefox rules', () => {
  const r = validate('firefox', firefox);
  assert.equal(r.ok, true, r.out);
  assert.match(r.out, /firefox\): VSA Ext .*background scripts/);
});

test('the chrome rules reject a firefox manifest', () => {
  const r = validate('chrome', firefox);
  assert.equal(r.ok, false);
  assert.match(r.out, /background\.scripts is not allowed/);
  assert.match(r.out, /browser_specific_settings belongs to the Firefox build/);
  assert.match(r.out, /background\.service_worker is required/);
});

test('the firefox rules reject a chrome manifest', () => {
  const r = validate('firefox', chrome);
  assert.equal(r.ok, false);
  assert.match(r.out, /service_worker is not supported by Firefox/);
  assert.match(r.out, /background\.scripts is required/);
  assert.match(r.out, /gecko\.id "" is missing/);
  assert.match(r.out, /strict_min_version must be 140 or later/);
  assert.match(r.out, /data_collection_permissions\.required/);
});

test('the firefox rules reject a low minimum version and a malformed id', () => {
  const bad = structuredClone(firefox);
  bad.browser_specific_settings.gecko.strict_min_version = '128.0';
  bad.browser_specific_settings.gecko.id = 'vsa-ext';
  const r = validate('firefox', bad);
  assert.equal(r.ok, false);
  assert.match(r.out, /found "128\.0"/);
  assert.match(r.out, /gecko\.id "vsa-ext" is missing or is not/);
});

test('a missing background script is reported', () => {
  const bad = structuredClone(firefox);
  bad.background.scripts = ['src/missing.js'];
  const r = validate('firefox', bad);
  assert.equal(r.ok, false);
  assert.match(r.out, /background\.scripts: missing src\/missing\.js/);
});
