// Hand-off of one month of tracked entries to the team CRA workbook.
//
// The workbook side is an Office Script ("CRA - Importer VSA Ext", see
// tools/cra-import/) that reads a single cell the user pastes into. The block
// is therefore one line of JSON: a newline would spread the paste over several
// cells and break it. Contract version 1; the script refuses anything else.
//
// `days` stays the source of truth. The workbook converts to hours with its own
// HeuresParJour setting; the check here assumes 8 so a bad fraction is caught
// before pasting rather than after.

import { entriesForMonth, isComplete } from './store.js';

export const CRA_PAYLOAD_VERSION = 1;
export const CRA_SOURCE = 'vsa-ext';
export const HOURS_PER_DAY = 8;

function isWhole(n) {
  return Math.abs(n - Math.round(n)) < 1e-9;
}

function byDateThenProject(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.project !== b.project) return a.project < b.project ? -1 : 1;
  return 0;
}

// Builds the block for one month. Incomplete rows are skipped and counted, as
// injection does; rows whose days do not make a whole number of hours are
// reported as problems and the caller must not copy anything.
export function buildCraPayload(entries, { month, person = '', hoursPerDay = HOURS_PER_DAY }) {
  const inMonth = entriesForMonth(entries, month);
  const complete = inMonth.filter(isComplete);
  const problems = [];
  const rows = [];
  for (const e of complete) {
    const days = Number(e.days);
    const hours = days * hoursPerDay;
    if (!isWhole(hours)) {
      problems.push(`${e.date} ${e.project}: ${days} day(s) is ${hours} h, not a whole number of hours`);
      continue;
    }
    rows.push({
      date: e.date,
      client: (e.client || '').trim(),
      project: (e.project || '').trim(),
      days,
      task: (e.note || '').trim(),
    });
  }
  rows.sort(byDateThenProject);
  const payload = {
    v: CRA_PAYLOAD_VERSION,
    source: CRA_SOURCE,
    month,
    person: (person || '').trim(),
    rows,
  };
  return {
    payload,
    problems,
    hours: rows.reduce((sum, r) => sum + r.days * hoursPerDay, 0),
    skipped: inMonth.length - complete.length,
  };
}

// JSON.stringify escapes newlines inside strings but leaves the two Unicode
// line separators (U+2028, U+2029) alone, and Excel would split the paste on
// them. They are spelled by code point so no editor can turn them back into
// invisible line breaks in this file.
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');
const BACKSLASH = String.fromCharCode(92);

function escapeChar(c) {
  return `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
}

// One line, always.
export function serializeCraPayload(payload) {
  return JSON.stringify(payload).replace(LINE_SEPARATORS, escapeChar);
}

// ---- Rows for the workbook's Admin referential --------------------------------
//
// The workbook only accepts projects listed in its Admin table (Client, Numéro,
// Projet). Rather than discovering a missing one at import time, the user copies
// the projects of the month as ready-to-paste rows and hands them to whoever
// keeps the referential.

const BS_CODE_RE = /\bBS-\d{2}-\d{6}\b/i;
const TAB = String.fromCharCode(9);
const NEWLINE = String.fromCharCode(10);
const WHITESPACE_RE = /\s+/g;

// A VSA label reads `BS-26-000079 [activity line] : Project name`. The project
// name is what follows the last " : ". A label without it keeps what remains
// once the number is removed, unbracketed when only a bracket is left.
export function projectNameOf(label) {
  const s = String(label || '').trim();
  const colon = s.lastIndexOf(' : ');
  if (colon >= 0) return s.slice(colon + 3).trim();
  const rest = s.replace(BS_CODE_RE, '').trim();
  const bracket = /^\[(.*)\]$/.exec(rest);
  return (bracket ? bracket[1] : rest).replace(WHITESPACE_RE, ' ').trim();
}

export function buildAdminRows(entries, { month }) {
  const inMonth = entriesForMonth(entries, month);
  const complete = inMonth.filter(isComplete);
  const seen = new Map();
  for (const e of complete) {
    const m = BS_CODE_RE.exec(e.project || '');
    const row = {
      client: (e.client || '').trim(),
      numero: m ? m[0].toUpperCase() : '',
      projet: projectNameOf(e.project),
    };
    seen.set(`${row.client}|${row.numero}|${row.projet}`, row);
  }
  const rows = [...seen.values()].sort((a, b) =>
    a.client.localeCompare(b.client) || a.numero.localeCompare(b.numero) || a.projet.localeCompare(b.projet)
  );
  return { rows, skipped: inMonth.length - complete.length };
}

// One tab-separated line per row, in the Admin table's column order:
// Client | Numéro | Projet | Type | Actif. Tabs and line breaks inside a value
// would shift the paste, so they become spaces.
export function serializeAdminRows(rows, { type = 'Facturable' } = {}) {
  const clean = (s) => String(s || '').replace(WHITESPACE_RE, ' ').trim();
  return rows.map((r) => [clean(r.client), clean(r.numero), clean(r.projet), type, 'Oui'].join(TAB)).join(NEWLINE);
}
