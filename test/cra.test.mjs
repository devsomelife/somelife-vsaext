import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCraPayload, serializeCraPayload, projectNameOf, buildAdminRows, serializeAdminRows,
  CRA_PAYLOAD_VERSION, CRA_SOURCE,
} from '../src/shared/cra.js';

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

test('projectNameOf reads the name after the colon, else strips number and bracket', () => {
  assert.equal(projectNameOf('BS-99-000079 [#01_05 maintenance - Assistance technique] : Projet Cellule 2026 S2'), 'Projet Cellule 2026 S2');
  assert.equal(projectNameOf('BS-99-000057 [#03_07-Dev-Ticket - Admin et Pilotage] : Reprise périmètre ZOL >>> 10/15'), 'Reprise périmètre ZOL >>> 10/15');
  assert.equal(projectNameOf('BS-99-000086 [Projet Principal]'), 'Projet Principal');
  assert.equal(projectNameOf('Portail fournisseurs'), 'Portail fournisseurs');
  assert.equal(projectNameOf('BS-99-000086'), '');
});

test('buildAdminRows lists each client/number/project of the month once, complete rows only', () => {
  const entries = [
    { date: '2026-09-02', client: 'NORTHWIND TRADING', project: 'BS-99-000079 [#01_05 maintenance] : Cellule 2026', days: 1, note: '' },
    { date: '2026-09-01', client: 'NORTHWIND TRADING', project: 'BS-99-000079 [#01_03 ACC ARCHI] : Cellule 2026', days: 0.25, note: '' },
    { date: '2026-09-01', client: 'ATLAS LOGISTIQUE', project: 'BS-99-000055 [Gestion des Flux] : Gestion des API', days: 0.5, note: '' },
    { date: '2026-09-03', client: 'ATLAS LOGISTIQUE', project: '', days: 1, note: 'incomplete' },
    { date: '2026-08-29', client: 'MERIDIAN SANTE', project: 'BS-99-000001 [x] : Autre mois', days: 1, note: '' },
  ];
  const { rows, skipped } = buildAdminRows(entries, { month: '2026-09' });
  assert.deepEqual(rows, [
    { client: 'ATLAS LOGISTIQUE', numero: 'BS-99-000055', projet: 'Gestion des API' },
    { client: 'NORTHWIND TRADING', numero: 'BS-99-000079', projet: 'Cellule 2026' },
  ]);
  assert.equal(skipped, 1);
});

test('serializeAdminRows makes one tab-separated line per row, Facturable and Oui filled in', () => {
  const TAB = String.fromCharCode(9);
  const NL = String.fromCharCode(10);
  const text = serializeAdminRows([
    { client: 'ATLAS LOGISTIQUE', numero: 'BS-99-000055', projet: `Gestion${TAB}des API${NL}v2` },
    { client: 'NORTHWIND TRADING', numero: '', projet: 'Cellule 2026' },
  ]);
  assert.equal(text, [
    ['ATLAS LOGISTIQUE', 'BS-99-000055', 'Gestion des API v2', 'Facturable', 'Oui'].join(TAB),
    ['NORTHWIND TRADING', '', 'Cellule 2026', 'Facturable', 'Oui'].join(TAB),
  ].join(NL));
});
