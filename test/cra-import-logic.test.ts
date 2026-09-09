import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePayload, normalizeKey, extractCode, readReferential, resolveProject, excelSerial, monthOfSerial,
  planImport, columnIndexes, isEntrySheet, planPlacement, calcFormulas, formatReport, formatRefusal,
  SOURCE_MARK, type CraPayload, type CellValue,
} from '../tools/cra-import/logic.ts';

const REF_HEADERS = ['Client', 'Numéro', 'Projet', 'Type', 'Actif', 'Libellé'];
const REF_BODY: CellValue[][] = [
  ['DE RIJKE France', 'BS-26-000086', 'Gestion interfaces', 'Facturable', 'Oui', 'DE RIJKE France - BS-26-000086 - Gestion interfaces'],
  ['Sergic', '', '', 'Facturable', 'Oui', 'Sergic'],
  ['Lhotellier', 15403, 'Portail Enduit', 'Facturable', 'Oui', 'Lhotellier - 15403 - Portail Enduit'],
  ['Lhotellier', '', 'Enrobé', 'Facturable', 'Oui', 'Lhotellier - Enrobé'],
  ['Telediag', 'BS-25-000001', 'Ancien', 'Facturable', 'Non', 'Telediag - BS-25-000001 - Ancien'],
  ['Blue Soft', '', 'Interco', 'Interne', 'oui', 'Blue Soft - Interco'],
  ['Vinci', 'BS-26-000200', 'Lot 1', 'Facturable', 'Oui', 'Vinci - BS-26-000200 - Lot 1'],
];
const ref = readReferential(REF_HEADERS, REF_BODY).projects;

const valid = (over: Partial<CraPayload> = {}): string =>
  JSON.stringify({
    v: 1,
    source: 'vsa-ext',
    month: '2026-09',
    person: '',
    rows: [
      { date: '2026-09-03', client: 'DE RIJKE FRANCE', project: 'BS-26-000086 [Projet Principal]', days: 0.5, task: 'atelier' },
      { date: '2026-09-01', client: 'SERGIC', project: 'BS-25-000012 [TMA]', days: 1, task: '' },
    ],
    ...over,
  });

test('parsePayload accepts the contract and trims strings', () => {
  const { payload, error } = parsePayload(valid({ person: ' Fabien DUCOUDRAY ' }));
  assert.equal(error, '');
  assert.equal(payload?.person, 'Fabien DUCOUDRAY');
  assert.equal(payload?.rows.length, 2);
  assert.equal(payload?.rows[0].days, 0.5);
});

test('parsePayload refuses garbage, wrong source, wrong version, empty rows, bad month', () => {
  assert.match(parsePayload('hello').error, /illisible/);
  assert.match(parsePayload(JSON.stringify({ v: 1, source: 'x', month: '2026-09', rows: [{}] })).error, /source/);
  assert.match(parsePayload(valid({ v: 2 })).error, /version 2/);
  assert.match(parsePayload(valid({ rows: [] })).error, /vide/);
  assert.match(parsePayload(valid({ month: '09/2026' })).error, /mois/);
});

test('normalizeKey ignores case, accents and spacing', () => {
  assert.equal(normalizeKey('  DE RIJKE   Fránce '), 'de rijke france');
  assert.equal(normalizeKey('Libellé'), 'libelle');
});

test('extractCode finds the BS number whatever the case', () => {
  assert.equal(extractCode('bs-26-000086 [Projet Principal]'), 'BS-26-000086');
  assert.equal(extractCode('Telediag'), '');
});

test('readReferential keeps active rows, reads Numéro as text, locates columns by header', () => {
  assert.equal(ref.length, 6);
  assert.equal(ref[2].numero, '15403');
  assert.ok(ref.every((p) => p.libelle !== 'Telediag - BS-25-000001 - Ancien'));
  assert.match(readReferential(['Client', 'Projet'], []).error, /Numéro|Actif|Libellé/);
});

test('resolveProject: by number first', () => {
  const r = resolveProject({ date: '', client: 'DE RIJKE FRANCE', project: 'BS-26-000086 [x]', days: 1, task: '' }, ref);
  assert.equal(r.libelle, 'DE RIJKE France - BS-26-000086 - Gestion interfaces');
});

test('resolveProject: duplicate number is reported', () => {
  const dup = ref.concat([{ client: 'Autre', numero: 'BS-26-000086', projet: 'Bis', libelle: 'Autre - BS-26-000086 - Bis' }]);
  const r = resolveProject({ date: '', client: 'DE RIJKE FRANCE', project: 'BS-26-000086 [x]', days: 1, task: '' }, dup);
  assert.equal(r.libelle, '');
  assert.match(r.error, /BS-26-000086 présent 2 fois/);
});

test('resolveProject: falls back to the client when it has exactly one compatible project', () => {
  const r = resolveProject({ date: '', client: 'SERGIC', project: 'BS-25-000012 [TMA]', days: 1, task: '' }, ref);
  assert.equal(r.libelle, 'Sergic');
});

test('resolveProject: a client whose only project carries another BS number is unknown', () => {
  const r = resolveProject({ date: '', client: 'Vinci', project: 'BS-26-000201 [Lot 2]', days: 1, task: '' }, ref);
  assert.equal(r.libelle, '');
  assert.match(r.error, /Projet inconnu/);
  assert.match(r.error, /BS-26-000201/);
});

test('resolveProject: several projects for the client is ambiguous', () => {
  const r = resolveProject({ date: '', client: 'LHOTELLIER', project: 'BS-26-000300 [Enduit]', days: 1, task: '' }, ref);
  assert.equal(r.libelle, '');
  assert.match(r.error, /2 projets/);
});

test('excelSerial and monthOfSerial', () => {
  assert.equal(excelSerial('2026-09-01'), 46266);
  assert.ok(Number.isNaN(excelSerial('2026-02-30')));
  assert.ok(Number.isNaN(excelSerial('01/09/2026')));
  assert.equal(monthOfSerial(46266), '2026-09');
  assert.equal(monthOfSerial(46266.75), '2026-09');
});

test('planImport converts to whole hours, sorts, and lists every problem once', () => {
  const ok = parsePayload(valid()).payload as CraPayload;
  const plan = planImport(ok, ref, 8);
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.rows.map((r) => [r.serial, r.libelle, r.hours, r.task]), [
    [46266, 'Sergic', 8, ''],
    [46268, 'DE RIJKE France - BS-26-000086 - Gestion interfaces', 4, 'atelier'],
  ]);
  const bad = parsePayload(valid({ rows: [
    { date: '2026-08-31', client: 'SERGIC', project: 'BS-25-000012 [TMA]', days: 1, task: '' },
    { date: '2026-09-02', client: 'SERGIC', project: 'BS-25-000012 [TMA]', days: 0.3, task: '' },
    { date: '2026-09-02', client: 'Nobody', project: 'BS-99-000001 [x]', days: 1, task: '' },
    { date: '2026-09-03', client: 'Nobody', project: 'BS-99-000001 [x]', days: 1, task: '' },
    { date: 'bad', client: 'SERGIC', project: 'BS-25-000012 [TMA]', days: 1, task: '' },
  ] })).payload as CraPayload;
  const refused = planImport(bad, ref, 8);
  assert.equal(refused.problems.filter((p) => /Projet inconnu/.test(p)).length, 1);
  assert.ok(refused.problems.some((p) => /hors du mois 2026-09/.test(p)));
  assert.ok(refused.problems.some((p) => /2\.4 h/.test(p)));
  assert.ok(refused.problems.some((p) => /date invalide/.test(p)));
});

test('columnIndexes / isEntrySheet', () => {
  const h = ['Date', 'Projet', 'Tâche', 'Heures', 'Jours', 'Mois', 'Semaine', 'Commentaire', 'Source'];
  const c = columnIndexes(h);
  assert.deepEqual(c, { date: 0, projet: 1, tache: 2, heures: 3, jours: 4, mois: 5, semaine: 6, commentaire: 7, source: 8 });
  assert.ok(isEntrySheet(h));
  assert.equal(columnIndexes(h.slice(0, 8)).source, -1);
  assert.ok(!isEntrySheet(['Client', 'Numéro', 'Projet', 'Type', 'Actif', 'Libellé']));
});

test('planPlacement reuses marked rows of the month and blank rows, clears leftovers, appends the rest', () => {
  const h = ['Date', 'Projet', 'Tâche', 'Heures', 'Jours', 'Mois', 'Semaine', 'Commentaire', 'Source'];
  const col = columnIndexes(h);
  const body: CellValue[][] = [
    [46235, 'Sergic', '', 8, '', '', '', '', SOURCE_MARK], // 2026-08-01: other month, kept
    [46266, 'Sergic', '', 8, '', '', '', '', SOURCE_MARK], // marked, this month
    [46267, 'Sergic', 'manual', 4, '', '', '', '', ''], // manual, kept
    ['', '', '', '', '', '', '', '', ''], // blank
    [46268, 'Sergic', '', 8, '', '', '', '', SOURCE_MARK], // marked, this month
  ];
  const p = planPlacement(body, col, '2026-09', 2);
  assert.deepEqual(p.reuse, [1, 3]);
  assert.deepEqual(p.clear, [4]);
  assert.equal(p.append, 0);
  assert.equal(p.replaced, 2);
  const more = planPlacement(body, col, '2026-09', 5);
  assert.deepEqual(more.reuse, [1, 3, 4]);
  assert.deepEqual(more.clear, []);
  assert.equal(more.append, 2);
});

test('calcFormulas use the real table name', () => {
  const f = calcFormulas('T_Modele6');
  assert.match(f.jours, /^=IF\(T_Modele6\[\[#This Row\],\[Heures\]\]=""/);
  assert.match(f.semaine, /ISOWEEKNUM\(T_Modele6/);
});

test('reports', () => {
  assert.equal(
    formatReport(12, 96, '2026-09', 10, new Date(2026, 8, 9, 14, 3)),
    '✔ 12 ligne(s) importée(s) pour 2026-09 (96 h) · 10 remplacée(s) · le 09/09/2026 14:03'
  );
  assert.equal(formatRefusal(['a', 'b']), '✖ Import refusé (2 problème(s)) : a · b');
});
