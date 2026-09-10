import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// selectors.js and inject.js are classic content scripts that register globals,
// so they run in a VM context against a fake DOM rather than being imported.
// vm keeps each file name, which is what lets code coverage attribute the lines
// to these files; code run through new Function is not counted at all.
function load(document) {
  class FocusEvent extends Event {}
  const ctx = vm.createContext({ document, Event, FocusEvent, setTimeout, clearTimeout });
  for (const rel of ['../src/content/selectors.js', '../src/content/inject.js']) {
    const file = fileURLToPath(new URL(rel, import.meta.url));
    vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return ctx.VsaInject;
}

// Values built inside the VM belong to another realm, so they are copied into
// plain arrays before a strict deep comparison.
const entries = (map) => Array.from(map, ([key, value]) => [key, value]);

// Elements are created on first lookup, so the test can inspect what was touched.
function fakeDom() {
  const els = new Map();
  const getElementById = (id) => {
    if (!els.has(id)) els.set(id, { id, value: '', style: {}, onchange: null, dispatchEvent() {} });
    return els.get(id);
  };
  return { els, document: { getElementById, querySelector: () => null, querySelectorAll: () => [] } };
}

test('commentsByDay keeps only days that have a note, trimmed', () => {
  const { commentsByDay } = load(fakeDom().document);
  const byDay = commentsByDay([
    { date: '2026-09-01', days: 1, note: '  Atelier interfaces  ' },
    { date: '2026-09-02', days: 1, note: '' },
    { date: '2026-09-03', days: 0.5 },
  ]);
  assert.deepEqual(entries(byDay), [[1, 'Atelier interfaces']]);
});

test('commentsByDay joins distinct notes of the same day and drops repeats', () => {
  const { commentsByDay } = load(fakeDom().document);
  const byDay = commentsByDay([
    { date: '2026-09-04', days: 0.5, note: 'Cadrage' },
    { date: '2026-09-04', days: 0.25, note: 'Recette' },
    { date: '2026-09-04', days: 0.25, note: 'Cadrage' },
  ]);
  assert.deepEqual(entries(byDay), [[4, 'Cadrage ; Recette']]);
});

test('writeComment runs the VSA handler, then closes the popup it toggled open', () => {
  const { els, document } = fakeDom();
  const { writeComment } = load(document);
  let calls = 0;
  document.getElementById('comment_2_r1').onchange = () => {
    calls++;
    document.getElementById('div_comment_2_r1').style.display = 'block';
  };
  writeComment('r1', 2, 'Recette');
  assert.equal(calls, 1);
  assert.equal(els.get('comment_2_r1').value, 'Recette');
  assert.equal(els.get('div_comment_2_r1').style.display, 'none');
});

test('writeTimes writes day comments only when sendNotes is set', () => {
  for (const sendNotes of [false, true]) {
    const { els, document } = fakeDom();
    const { writeTimes } = load(document);
    const prepared = [{
      client: 'NORTHWIND TRADING', project: 'BS-99-000112 [Lot 1]', row: 'r1', ok: true,
      days: [
        { date: '2026-09-03', days: 1, note: 'Atelier interfaces' },
        { date: '2026-09-04', days: 1, note: '' },
      ],
    }];
    const [line] = writeTimes(prepared, null, { sendNotes });
    assert.equal(line.ok, true);
    assert.equal(els.get('input_day_((r1))_[[3]]').value, '1');
    if (sendNotes) {
      assert.equal(line.comments, 1);
      assert.equal(els.get('comment_3_r1').value, 'Atelier interfaces');
      assert.equal(els.has('comment_4_r1'), false, 'a day without a note keeps its VSA comment');
    } else {
      assert.equal(line.comments, 0);
      assert.equal(els.has('comment_3_r1'), false, 'no comment field is touched');
    }
  }
});
