// Shadow tracking data model.
//
// An entry is one day of time on one activity line:
//   { date: "2026-09-08", client: "DE RIJKE FRANCE", project: "BS-26-000086", days: 1, note: "" }
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

// Rows are dropped when they carry no date or no project, so a half-filled
// row in the editor never reaches storage.
export function normalize(rows) {
  return rows
    .filter((r) => r.date && r.project)
    .map((r) => ({
      date: r.date,
      client: (r.client || '').trim(),
      project: (r.project || '').trim(),
      days: Number(r.days) || 0,
      note: (r.note || '').trim(),
    }));
}
