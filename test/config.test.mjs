import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCraUrl } from '../src/shared/config.js';

test('keeps the sharing link whole, query included', () => {
  const link = 'https://bluesoftgroup.sharepoint.com/:x:/r/sites/Rouen/Documents%20partages/General/CRA-Equipe.xlsx?d=w153&csf=1&web=1&e=W56ueg';
  assert.equal(normalizeCraUrl(`  ${link} `), link);
});

test('empty input clears the link', () => {
  assert.equal(normalizeCraUrl(''), '');
  assert.equal(normalizeCraUrl(undefined), '');
});

test('rejects non http(s) and non URL input', () => {
  assert.throws(() => normalizeCraUrl('ftp://x/y'), /http or https/);
  assert.throws(() => normalizeCraUrl('not a url'), TypeError);
});
