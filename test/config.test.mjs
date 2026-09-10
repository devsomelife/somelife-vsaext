import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCraUrl, getNotesToVsa, setNotesToVsa } from '../src/shared/config.js';

test('keeps the sharing link whole, query included', () => {
  const link = 'https://contoso.sharepoint.com/:x:/r/sites/Team/Documents%20partages/General/CRA-Equipe.xlsx?d=w153&csf=1&web=1&e=AbC123';
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

test('sending notes to VSA is off unless explicitly enabled', async () => {
  const store = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: async (k) => (k in store ? { [k]: store[k] } : {}),
        set: async (o) => Object.assign(store, o),
      },
    },
  };
  assert.equal(await getNotesToVsa(), false);
  await setNotesToVsa(true);
  assert.equal(await getNotesToVsa(), true);
  await setNotesToVsa('yes');
  assert.equal(await getNotesToVsa(), false);
});
