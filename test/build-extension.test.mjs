import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeManifest } from '../.github/scripts/build-extension.mjs';

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const base = read('../manifest.json');
const overlay = read('../manifest.firefox.json');

test('the chrome manifest is the base manifest, unchanged', () => {
  assert.deepEqual(mergeManifest(base, null), base);
});

test('the firefox manifest swaps the service worker for background scripts', () => {
  const firefox = mergeManifest(base, overlay);
  assert.deepEqual(firefox.background, { scripts: ['src/background.js'], type: 'module' });
  assert.equal('service_worker' in firefox.background, false);
});

test('the firefox manifest keeps everything else from the base', () => {
  const firefox = mergeManifest(base, overlay);
  for (const key of ['manifest_version', 'name', 'version', 'description', 'permissions', 'optional_host_permissions', 'options_page', 'action', 'icons']) {
    assert.deepEqual(firefox[key], base[key], key);
  }
});

test('the firefox manifest carries the gecko settings AMO requires', () => {
  const { gecko } = mergeManifest(base, overlay).browser_specific_settings;
  assert.equal(gecko.id, 'vsa-ext@somelife.eu');
  assert.equal(gecko.strict_min_version, '140.0');
  assert.deepEqual(gecko.data_collection_permissions, { required: ['none'] });
});

test('the overlay cannot set the version, name or manifest version', () => {
  for (const key of ['version', 'name', 'manifest_version']) {
    assert.throws(() => mergeManifest(base, { ...overlay, [key]: 'x' }), new RegExp(key));
  }
});

test('merging does not modify its inputs', () => {
  const before = JSON.stringify([base, overlay]);
  mergeManifest(base, overlay).background.scripts.push('changed.js');
  assert.equal(JSON.stringify([base, overlay]), before);
});
