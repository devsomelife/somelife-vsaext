import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COUNTRIES } from '../src/shared/holidays.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const LOCALES = ['en', 'fr'];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read(`../_locales/${l}/messages.json`))]));
const html = read('../src/options/options.html');
const js = read('../src/options/options.js');
const manifest = JSON.parse(read('../manifest.json'));

// chrome.i18n.getMessage as Chrome and Firefox implement it: named $PLACEHOLDER$
// (any case) become their content, then $1..$9 become the substitutions.
function getMessage(locale, key, subs = []) {
  const entry = messages[locale][key];
  if (!entry) return '';
  const named = Object.fromEntries(
    Object.entries(entry.placeholders ?? {}).map(([name, p]) => [name.toLowerCase(), p.content])
  );
  return entry.message
    .replace(/\$([A-Za-z0-9_@]+)\$/g, (all, name) => named[name.toLowerCase()] ?? all)
    .replace(/\$(\d)/g, (all, n) => subs[n - 1] ?? '');
}

// i18n.js caches the locale's rules, so each locale gets its own module copy.
async function load(locale) {
  globalThis.chrome = { i18n: { getMessage: (key, subs) => getMessage(locale, key, subs) } };
  return import(`../src/shared/i18n.js?${locale}`);
}

test('every locale has the same keys', () => {
  assert.deepEqual(Object.keys(messages.fr).sort(), Object.keys(messages.en).sort());
});

test('keys are valid message names and counted messages come in pairs', () => {
  for (const key of Object.keys(messages.en)) {
    assert.match(key, /^[A-Za-z0-9_]+$/, key);
    const counted = key.match(/^(.+)_(one|other)$/);
    if (counted) {
      assert.ok(messages.en[`${counted[1]}_one`] && messages.en[`${counted[1]}_other`], key);
    }
  }
});

test('placeholders are declared, used, numbered in order and the same in every locale', () => {
  for (const key of Object.keys(messages.en)) {
    const declared = Object.keys(messages.en[key].placeholders ?? {});
    for (const locale of LOCALES) {
      const { message, placeholders = {} } = messages[locale][key];
      assert.deepEqual(Object.keys(placeholders), declared, `${locale} ${key}`);
      const used = new Set([...message.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((m) => m[1].toLowerCase()));
      assert.deepEqual([...used].sort(), declared.map((n) => n.toLowerCase()).sort(), `${locale} ${key}`);
      assert.deepEqual(
        Object.values(placeholders).map((p) => p.content),
        declared.map((_, i) => `$${i + 1}`),
        `${locale} ${key}`
      );
      assert.equal(messages[locale][key].placeholders?.count?.content ?? '$1', '$1', `${locale} ${key}: count comes first`);
    }
  }
});

// Every key the extension asks for, and nothing it never asks for.
function usedKeys() {
  const used = new Set(['locale']);
  for (const m of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) used.add(m[1]);
  for (const m of js.matchAll(/\bt\('([^']+)'/g)) used.add(m[1]);
  for (const m of js.matchAll(/\btn\('([^']+)'/g)) used.add(`${m[1]}_one`).add(`${m[1]}_other`);
  for (const m of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) used.add(m[1]);
  for (const [code, country] of Object.entries(COUNTRIES)) {
    used.add(`country_${code}`);
    if (country.observe) used.add(`observed_${country.observe}`);
  }
  return used;
}

test('every key used by the options page and the manifest exists', () => {
  for (const key of usedKeys()) assert.ok(messages.en[key], `missing message "${key}"`);
});

test('every message is used', () => {
  const used = usedKeys();
  assert.deepEqual(Object.keys(messages.en).filter((key) => !used.has(key)), []);
});

test('every holiday reset button and country has its label', () => {
  for (const code of Object.keys(COUNTRIES)) {
    assert.match(html, new RegExp(`data-holidays-reset="${code}" data-i18n="resetHolidays_${code}"`));
  }
});

test('no hardcoded label is left in the options page markup', () => {
  const text = [...html.matchAll(/>([^<]+)</g)].map((m) => m[1].trim()).filter(Boolean);
  // The title is the extension name, the arrows and the total are not words,
  // and each language is named in its own.
  assert.deepEqual(text, ['VSA Ext', '&lt;', '&gt;', 'Français', 'English', '0']);
});

test('English messages, with English plurals', async () => {
  const { t, tn, formatNumber, uiLocale, dateLocale } = await load('en');
  assert.equal(uiLocale(), 'en');
  assert.equal(dateLocale().split('-')[0], 'en');
  assert.equal(t('addRow'), 'Add row');
  assert.equal(tn('addCountRows', 1), 'Add 1 row');
  assert.equal(tn('addCountRows', 0), 'Add 0 rows');
  assert.equal(tn('rowsReady', 3, 2), '2/3 rows ready to inject');
  assert.equal(t('rangeAdded_other', 5, 'Mon 07/09', 'Fri 11/09'), 'Added 5 rows, Mon 07/09 to Fri 11/09.');
  assert.equal(formatNumber(0.5), '0.5');
  assert.equal(t('noSuchKey'), 'noSuchKey');
});

test('French messages, with French plurals and decimals', async () => {
  const { t, tn, formatNumber, uiLocale, dateLocale } = await load('fr');
  assert.equal(uiLocale(), 'fr');
  assert.equal(dateLocale().split('-')[0], 'fr');
  assert.equal(t('listSemicolon', 'a', 'b'), 'a\u00a0; b');
  assert.equal(t('addRow'), 'Ajouter une ligne');
  assert.equal(tn('addCountRows', 0), 'Ajouter 0 ligne');
  assert.equal(tn('addCountRows', 1), 'Ajouter 1 ligne');
  assert.equal(tn('addCountRows', 2), 'Ajouter 2 lignes');
  assert.equal(tn('addCountRows', 1000000), 'Ajouter 1000000 lignes');
  assert.equal(t('dayMissing', formatNumber(0.25)), 'il manque 0,25');
  assert.equal(t('syncProgress', 3, 7, 'CLIENT'), 'Synchronisation 3/7 : CLIENT');
});
