// Sets the extension version in manifest.json.
//
// Chrome requires one to four dot-separated integers, each 0-65535, with no
// leading zeros. Anything else is rejected at load time, so it is validated
// here rather than discovered by whoever installs the release.
//
// Usage: node set-version.mjs 0.2.0

import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2]?.trim().replace(/^v/, '');

if (!version) {
  console.error('usage: set-version.mjs <version>');
  process.exit(1);
}

const parts = version.split('.');
const valid =
  parts.length >= 1 &&
  parts.length <= 4 &&
  parts.every((p) => /^(0|[1-9]\d*)$/.test(p) && Number(p) <= 65535);

if (!valid) {
  console.error(
    `invalid version "${version}": Chrome requires 1-4 dot-separated integers, ` +
      'each 0-65535 with no leading zeros (e.g. 0.2.0)'
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const previous = manifest.version;

if (previous === version) {
  console.error(`manifest.json is already at ${version}`);
  process.exit(1);
}

manifest.version = version;
writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${previous} -> ${version}`);
