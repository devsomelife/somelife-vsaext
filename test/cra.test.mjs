import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCraPayload, serializeCraPayload, CRA_PAYLOAD_VERSION, CRA_SOURCE } from '../src/shared/cra.js';

const entries = [
  { date: '2026-09-03', client: 'NORTHWIND TRADING', project: 'BS-99-000086 [Projet Principal]', projectCode: '1|A', days: 0.5, note: '  atelier  ' },
  { date: '2026-09-01', client: 'ATLAS LOGISTIQUE', project: 'BS-99-000012 [TMA]', projectCode: '1|X', days: 1, note: '' },
  { date: '2026-09-01', client: 'NORTHWIND TRADING', project: 'BS-99-000086 [Projet Principal]', projectCode: '1|A', days: '0.125', note: '' },
  { date: '2026-09-02', client: 'ATLAS LOGISTIQUE', project: '', projectCode: undefined, days: 1, note: 'incomplete: no project' },
  { date: '2026-08-31', client: 'ATLAS LOGISTIQUE', project: 'BS-99-000012 [TMA]', projectCode: '1|X', days: 1, note: 'other month' },
];

test('keeps complete rows of the month, sorted by date then project, trimmed', () => {
  const { payload, problems, hours, skipped } = buildCraPayload(entries, { month: '2026-09', person: ' Camille DUPONT ' });
  assert.deepEqual(problems, []);
  assert.equal(skipped, 1);
  assert.equal(hours, 13);
  assert.equal(payload.v, CRA_PAYLOAD_VERSION);
  assert.equal(payload.source, CRA_SOURCE);
  assert.equal(payload.month, '2026-09');
  assert.equal(payload.person, 'Camille DUPONT');
  assert.deepEqual(payload.rows, [
    { date: '2026-09-01', client: 'ATLAS LOGISTIQUE', project: 'BS-99-000012 [TMA]', days: 1, task: '' },
    { date: '2026-09-01', client: 'NORTHWIND TRADING', project: 'BS-99-000086 [Projet Principal]', days: 0.125, task: '' },
    { date: '2026-09-03', client: 'NORTHWIND TRADING', project: 'BS-99-000086 [Projet Principal]', days: 0.5, task: 'atelier' },
  ]);
  assert.ok(!('projectCode' in payload.rows[0]));
});

test('reports rows whose days are not a whole number of hours', () => {
  const bad = [{ date: '2026-09-04', client: 'ATLAS LOGISTIQUE', project: 'BS-99-000012 [TMA]', days: 0.3, note: '' }];
  const { payload, problems } = buildCraPayload(bad, { month: '2026-09' });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /2026-09-04/);
  assert.match(problems[0], /2\.4 h/);
  assert.deepEqual(payload.rows, []);
});

test('person defaults to an empty string', () => {
  const { payload } = buildCraPayload(entries, { month: '2026-09' });
  assert.equal(payload.person, '');
});

test('serialization is one line even with line separators in a task', () => {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  const NL = String.fromCharCode(10);
  const note = `line1${NL}line2${LS}line3${PS}line4`;
  const rows = [{ date: '2026-09-01', client: 'A', project: 'BS-99-000001 [x]', days: 1, note }];
  const { payload } = buildCraPayload(rows, { month: '2026-09' });
  const text = serializeCraPayload(payload);
  assert.ok(!text.includes(NL) && !text.includes(String.fromCharCode(13)));
  assert.ok(!text.includes(LS) && !text.includes(PS));
  assert.equal(JSON.parse(text).rows[0].task, note);
});
