// Builds the browser packages from the same sources.
//
// manifest.json is the Chrome and Edge manifest, and stays loadable as-is from
// the repository root. manifest.firefox.json only holds what Firefox needs
// differently (background scripts instead of a service worker, and the gecko
// settings); it is merged over the base manifest at the top level.
//
// Usage: node .github/scripts/build-extension.mjs [chrome|firefox|all] [--zip]
//   build/<target>/            unpacked extension, loadable in that browser
//   vsa-ext-<version>.zip       Chrome Web Store package      (with --zip)
//   vsa-ext-firefox-<version>.zip  addons.mozilla.org package (with --zip)

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Everything that ships, for every browser.
export const PACKAGE_FILES = ['src', 'icons', 'docs/guide.html'];

export const TARGETS = {
  chrome: { overlay: null, zip: (version) => `vsa-ext-${version}.zip` },
  firefox: { overlay: 'manifest.firefox.json', zip: (version) => `vsa-ext-firefox-${version}.zip` },
};

// These come from manifest.json only, so the version is set in one place.
const RESERVED = ['manifest_version', 'name', 'version'];

export function mergeManifest(base, overlay) {
  if (!overlay) return structuredClone(base);
  const clash = RESERVED.filter((key) => key in overlay);
  if (clash.length) {
    throw new Error(`the manifest overlay must not set ${clash.join(', ')}: they come from manifest.json`);
  }
  return { ...structuredClone(base), ...structuredClone(overlay) };
}

export function build(target, { zip = false } = {}) {
  const spec = TARGETS[target];
  if (!spec) throw new Error(`unknown target "${target}", expected ${Object.keys(TARGETS).join(', ')} or all`);

  const base = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const overlay = spec.overlay ? JSON.parse(readFileSync(join(ROOT, spec.overlay), 'utf8')) : null;
  const manifest = mergeManifest(base, overlay);

  const out = join(ROOT, 'build', target);
  rmSync(out, { recursive: true, force: true });
  for (const rel of PACKAGE_FILES) {
    const dest = join(out, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(ROOT, rel), dest, { recursive: true });
  }
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const result = { target, dir: out, version: manifest.version };
  if (zip) {
    // zip adds to an existing archive rather than replacing it.
    const file = join(ROOT, spec.zip(manifest.version));
    rmSync(file, { force: true });
    execFileSync('zip', ['-r', '-q', '-X', file, '.'], { cwd: out });
    result.zip = file;
  }
  return result;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const zip = args.includes('--zip');
  const which = args.find((arg) => !arg.startsWith('--')) || 'all';
  const targets = which === 'all' ? Object.keys(TARGETS) : [which];
  try {
    for (const target of targets) {
      const r = build(target, { zip });
      console.log(`${target}: ${relative(ROOT, r.dir)}${r.zip ? `, ${relative(ROOT, r.zip)}` : ''} (${r.version})`);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
