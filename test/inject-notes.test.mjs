import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SELECTORS = fileURLToPath(new URL('../src/content/selectors.js', import.meta.url));
const INJECT = fileURLToPath(new URL('../src/content/inject.js', import.meta.url));

// selectors.js and inject.js are classic content scripts that register globals,
// so they run in a VM context against a fake DOM rather than being imported.
// vm keeps each file name, which is what lets code coverage attribute the lines
// to these files; code run through new Function is not counted at all.
function load(document) {
  class FocusEvent extends Event {}
  const ctx = vm.createContext({ document, Event, FocusEvent, setTimeout, clearTimeout });
  for (const file of [SELECTORS, INJECT]) {
    vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return ctx.VsaInject;
}

// Values built inside the VM belong to another realm, so they are copied into
// plain arrays before a strict deep comparison.
const entries = (map) => Array.from(map, ([key, value]) => [key, value]);

// Dispatching an event records its type and runs the matching on<type>
// property, the way a browser runs an inline attribute handler for it.
function fakeElement(id, props = {}) {
  return {
    id,
    value: '',
    style: {},
    options: [],
    events: [],
    onchange: null,
    dispatchEvent(ev) {
      this.events.push(ev.type);
      const handler = this[`on${ev.type}`];
      if (typeof handler === 'function') handler.call(this, ev);
      return true;
    },
    ...props,
  };
}

// Elements are created on first lookup, so the test can inspect what was touched.
// Selector lookups only answer for selectors the test registered.
function fakeDom() {
  const els = new Map();
  const selectors = new Map();
  const getElementById = (id) => {
    if (!els.has(id)) els.set(id, fakeElement(id));
    return els.get(id);
  };
  const document = {
    getElementById,
    querySelector: (sel) => selectors.get(sel) ?? null,
    querySelectorAll: (sel) => (selectors.has(sel) ? [selectors.get(sel)] : []),
  };
  return { els, selectors, document };
}

const option = (value, text = value) => ({ value, text, disabled: false, parentElement: null });
const ACTIVITY_SELECT = 'select.selectTimesheetLine[id^="tiers_"]';

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

test('writeComment runs the VSA handler through one change event, then closes the popup it toggled open', () => {
  const { els, document } = fakeDom();
  const { writeComment } = load(document);
  let calls = 0;
  document.getElementById('comment_2_r1').onchange = () => {
    calls++;
    document.getElementById('div_comment_2_r1').style.display = 'block';
  };
  writeComment('r1', 2, 'Recette');
  assert.equal(calls, 1);
  assert.deepEqual(els.get('comment_2_r1').events, ['change']);
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

test('fetchCatalog restores the original activity through a change event', async () => {
  const { selectors, document } = fakeDom();
  const { fetchCatalog } = load(document);
  const act = document.getElementById('tiers_r1');
  act.value = 'I-INTERNE';
  act.options = [option('I-INTERNE', 'Liste des activités')];
  selectors.set(ACTIVITY_SELECT, act);

  const catalog = await fetchCatalog();

  assert.equal(catalog.length, 0);
  assert.equal(act.value, 'I-INTERNE');
  assert.deepEqual(act.events, ['change']);
});

test('prepareLines selects client and project through change events', async () => {
  const { selectors, document } = fakeDom();
  const { prepareLines } = load(document);
  const act = document.getElementById('tiers_r1');
  act.value = 'I-INTERNE';
  act.options = [option('I-INTERNE', 'Liste des activités'), option('C-1', 'NORTHWIND TRADING')];
  const project = fakeElement('project_r1', { options: [option('none', 'Choose a mission / project')] });
  selectors.set(ACTIVITY_SELECT, act);
  selectors.set('select.select_order[name="line[r1][order_id]"]', project);

  // VSA's activity handler reloads the project list for the chosen client.
  let activityCalls = 0;
  let projectCalls = 0;
  act.onchange = () => {
    activityCalls++;
    project.options = [option('none', 'Choose a mission / project'), option('98001|ATE', 'BS-99-000112 [Lot 1]')];
  };
  project.onchange = () => {
    projectCalls++;
  };

  const [line] = await prepareLines([
    { date: '2026-09-03', client: 'NORTHWIND TRADING', project: 'BS-99-000112 [Lot 1]', projectCode: '98001|ATE', days: 1 },
  ]);

  assert.equal(line.ok, true, line.error);
  assert.equal(act.value, 'C-1');
  assert.equal(project.value, '98001|ATE');
  assert.equal(activityCalls, 1, 'getBdc runs once per client change');
  assert.equal(projectCalls, 1);
  assert.deepEqual(act.events, ['change']);
  assert.deepEqual(project.events, ['change']);
});

test('inject.js never calls page handlers directly', () => {
  const src = readFileSync(INJECT, 'utf8');
  assert.doesNotMatch(src, /\.on(change|click|input|blur)\s*\(/);
});
