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
    createElement: (tag) => fakeElement('', { tagName: tag.toUpperCase() }),
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

test('fetchCatalog lists grouped internal activities without selecting them, clients walked as before', async () => {
  const { selectors, document } = fakeDom();
  const { fetchCatalog } = load(document);
  const act = document.getElementById('tiers_r1');
  const internalGroup = { tagName: 'OPTGROUP', label: 'Activités internes' };
  const clientGroup = { tagName: 'OPTGROUP', label: 'Clients' };
  act.value = 'I-INTERNE';
  act.options = [
    option('I-INTERNE', 'Liste des activités'),
    option('I-ABSENCE', 'Absence'),
    { ...option('I-FORMATION', 'Formation'), parentElement: internalGroup },
    { ...option('I-ALTERNANCE_ECOLE', 'Alternance Ecole'), parentElement: internalGroup },
    { ...option('C-1', 'NORTHWIND TRADING'), parentElement: clientGroup },
  ];
  const project = fakeElement('project_r1', { options: [option('none', 'Choose a mission / project')] });
  selectors.set(ACTIVITY_SELECT, act);
  selectors.set('select.select_order[name="line[r1][order_id]"]', project);
  const chosen = [];
  act.onchange = () => {
    chosen.push(act.value);
    project.options = act.value === 'C-1'
      ? [option('none', 'Choose a mission / project'), option('98001|ATE', 'BS-99-000112 [Lot 1]')]
      : [option('none', 'Choose a mission / project')];
  };

  const catalog = await fetchCatalog();

  assert.deepEqual(JSON.parse(JSON.stringify(catalog)), [
    { label: 'Alternance Ecole', code: 'I-ALTERNANCE_ECOLE', internal: true, projects: [] },
    { label: 'Formation', code: 'I-FORMATION', internal: true, projects: [] },
    { label: 'NORTHWIND TRADING', code: 'C-1', projects: [{ label: 'BS-99-000112 [Lot 1]', code: '98001|ATE' }] },
  ]);
  assert.deepEqual(chosen, ['C-1', 'I-INTERNE'], 'only clients are selected, then the original is restored');
});

test('fetchCatalog adds a line through "+" on a page without any, then syncs from it', async () => {
  const { selectors, document } = fakeDom();
  const { fetchCatalog } = load(document);
  const act = document.getElementById('tiers_r1');
  act.value = 'I-INTERNE';
  act.options = [
    option('I-INTERNE', 'Liste des activités'),
    { ...option('C-1', 'NORTHWIND TRADING'), parentElement: { tagName: 'OPTGROUP', label: 'Clients' } },
  ];
  const project = fakeElement('project_r1', { options: [option('none', 'Choose a mission / project')] });
  selectors.set('select.select_order[name="line[r1][order_id]"]', project);
  act.onchange = () => {
    project.options = act.value === 'C-1'
      ? [option('none', 'Choose a mission / project'), option('98001|ATE', 'BS-99-000112 [Lot 1]')]
      : [option('none', 'Choose a mission / project')];
  };
  // VSA's addLine inserts the fetched line after the last line row, and adds
  // nothing when there is none.
  const lineRows = [];
  const body = {
    appendChild(el) {
      el.remove = () => lineRows.splice(lineRows.indexOf(el), 1);
      lineRows.push(el);
      return el;
    },
    querySelector: (sel) => (sel === 'tr[id^="line_"]' ? lineRows.find((tr) => tr.id.startsWith('line_')) ?? null : null),
  };
  selectors.set('#grid_thead_table_crapivot > tbody', body);
  let clicks = 0;
  selectors.set('a.mainaction-add-like-plus', {
    click() {
      clicks++;
      if (!body.querySelector('tr[id^="line_"]')) return;
      lineRows.push({ id: 'line_r1' });
      selectors.set(ACTIVITY_SELECT, act);
    },
  });

  const catalog = await fetchCatalog();

  assert.equal(clicks, 1);
  assert.deepEqual(lineRows.map((tr) => tr.id), ['line_r1'], 'the placeholder line is removed');
  assert.deepEqual(JSON.parse(JSON.stringify(catalog)), [
    { label: 'NORTHWIND TRADING', code: 'C-1', projects: [{ label: 'BS-99-000112 [Lot 1]', code: '98001|ATE' }] },
  ]);
  assert.equal(act.value, 'I-INTERNE', 'the added line is left empty');
});

test('fetchCatalog says the "+" button is missing on a page without any line', async () => {
  const { fetchCatalog } = load(fakeDom().document);
  await assert.rejects(fetchCatalog(), { message: 'no "+" button to add a timesheet line on this page' });
});

test('prepareLines sets an internal activity once VSA rebuilt the unit text, and chooses no project', async () => {
  const { selectors, document } = fakeDom();
  const { prepareLines } = load(document);
  const act = document.getElementById('tiers_r1');
  act.value = 'I-INTERNE';
  act.options = [
    option('I-INTERNE', 'Liste des activités'),
    { ...option('I-ALTERNANCE_ECOLE', 'Alternance Ecole'), parentElement: { tagName: 'OPTGROUP', label: 'Activités internes' } },
  ];
  const unit = fakeElement('unit_r1', { firstChild: { text: 'heures' } });
  selectors.set(ACTIVITY_SELECT, act);
  selectors.set('p.time_r1', unit);
  // VSA answers the change with the line's unit, replacing the text node.
  act.onchange = () => {
    setTimeout(() => {
      unit.firstChild = { text: 'jours' };
    }, 200);
  };

  const [line] = await prepareLines([
    { date: '2026-09-07', client: 'Alternance Ecole', project: '', internal: true, days: 1 },
  ]);

  assert.equal(line.ok, true, line.error);
  assert.equal(line.internal, true);
  assert.equal(act.value, 'I-ALTERNANCE_ECOLE');
  assert.deepEqual(act.events, ['change']);
  assert.equal(unit.firstChild.text, 'jours', 'the reply had arrived when the line was reported ready');
});

test('inject.js never calls page handlers directly', () => {
  const src = readFileSync(INJECT, 'utf8');
  assert.doesNotMatch(src, /\.on(change|click|input|blur)\s*\(/);
});
