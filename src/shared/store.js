// Shadow tracking data model.
//
// An entry is one day of time on one activity line:
//   { date: "2026-09-08", client: "NORTHWIND TRADING",
//     project: "BS-26-000087 [...]", projectCode: "10001|ATE", days: 1, note: "" }
//
// `projectCode` is the VSA option value; it is what injection matches on, since
// project labels drift as days are booked against them.
//
// `days` is expressed the way VSA does: fractions of a day (1, 0.5, 0.25...).

const KEY = 'entries';

export async function loadEntries() {
  const bag = await chrome.storage.local.get(KEY);
  return bag[KEY] ?? [];
}

export async function saveEntries(entries) {
  await chrome.storage.local.set({ [KEY]: entries });
}

export function entryId(e) {
  return `${e.date}|${e.client}|${e.project}`;
}

export function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

export function entriesForMonth(entries, month) {
  return entries
    .filter((e) => monthOf(e.date) === month)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function totalDays(entries) {
  return entries.reduce((sum, e) => sum + Number(e.days || 0), 0);
}

// Cleans a row in place. Rows are NOT dropped here: a half-filled row is a row
// the user is still typing into, and discarding it would make it disappear from
// under the cursor. Mutating rather than rebuilding also keeps the identity the
// editor's event handlers hold, so edits keep landing on the stored object.
export function normalize(rows) {
  for (const r of rows) {
    r.client = (r.client || '').trim();
    r.project = (r.project || '').trim();
    r.days = Number(r.days) || 0;
    r.note = (r.note || '').trim();
  }
  return rows;
}

// Incomplete rows are excluded only at the point they would be sent to VSA.
export function isComplete(entry) {
  return Boolean(entry.date && entry.project && entry.days > 0);
}
