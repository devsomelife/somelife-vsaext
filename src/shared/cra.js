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
