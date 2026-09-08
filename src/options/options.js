import {
  loadEntries,
  saveEntries,
  entriesForMonth,
  totalDays,
  normalize,
  isComplete,
} from '../shared/store.js';

const $ = (id) => document.getElementById(id);
const rowsEl = $('rows');
const statusEl = $('status');

let entries = [];
let catalog = [];

const todayMonth = new Date().toISOString().slice(0, 7);

function say(msg, isError) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#c33' : '#2a7';
}

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function currentMonth() {
  return $('month').value || todayMonth;
}

function shiftMonth(delta) {
  const [y, m] = currentMonth().split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  $('month').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  render();
}

// Client and project are picked from the synced VSA catalog, never typed, so
// an entry can only ever name a client/project pair VSA will actually accept.
// A stored value that is no longer in the catalog is kept as a marked option
// rather than silently dropped, so an old month stays readable after a resync.
// Labels come from VSA, so they are escaped rather than trusted as markup.
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function optionsHtml(values, selected, placeholder) {
  const known = values.includes(selected);
  const opts = [`<option value="">${esc(placeholder)}</option>`];
  if (selected && !known) {
    opts.push(`<option value="${esc(selected)}" selected>${esc(selected)} (not in catalog)</option>`);
  }
  for (const v of values) {
    opts.push(`<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`);
  }
  return opts.join('');
}

function clientLabels() {
  return catalog.map((c) => c.label);
}

// Merging never deletes, so a client removed in VSA would linger forever.
// Reset drops everything and forces a clean rebuild on the next sync.
async function resetCatalog() {
  catalog = [];
  await saveCatalog();
  render();
  say('Catalog cleared. Run a sync to rebuild it.');
}

// Projects are scoped to the selected client. With no client chosen there is
// nothing valid to offer, so the project select stays empty and disabled.
function codeForProject(clientLabel, projectLabel) {
  const c = catalog.find((x) => x.label === clientLabel);
  return c?.projects.find((p) => p.label === projectLabel)?.code;
}

function projectsFor(clientLabel) {
  const c = catalog.find((x) => x.label === clientLabel);
  return c ? c.projects.map((p) => p.label) : [];
}

function fillProjects(tr, client) {
  const sel = tr.querySelector('[data-f="project"]');
  const values = projectsFor(client);
  const current = sel.value;
  sel.innerHTML = optionsHtml(values, values.includes(current) ? current : '', 'Project...');
  sel.disabled = values.length === 0;
}

function rowTemplate(e) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="date" data-f="date"></td>
    <td><select data-f="client"></select></td>
    <td><select data-f="project"></select></td>
    <td class="days"><input data-f="days" type="number" step="0.125" min="0" max="1"></td>
    <td><input data-f="note"></td>
    <td><button type="button" data-act="del">x</button></td>`;

  const clientSel = tr.querySelector('[data-f="client"]');
  clientSel.innerHTML = optionsHtml(clientLabels(), e.client || '', 'Client...');

  const projectSel = tr.querySelector('[data-f="project"]');
  projectSel.innerHTML = optionsHtml(projectsFor(e.client), e.project || '', 'Project...');
  projectSel.disabled = projectsFor(e.client).length === 0;
  // Labels are longer than the column, so the full text is available on hover.
  projectSel.title = e.project || '';

  for (const el of tr.querySelectorAll('[data-f]')) {
    const field = el.dataset.f;
    if (el.tagName !== 'SELECT') el.value = e[field] ?? '';

    const apply = () => {
      // Days is numeric; everything else is stored as typed.
      e[field] = field === 'days' ? Number(el.value) || 0 : el.value;

      // Changing client invalidates any project from the previous one.
      if (field === 'client') {
        fillProjects(tr, el.value);
        e.project = tr.querySelector('[data-f="project"]').value;
      }
      // The option value is recorded alongside the label so injection can match
      // the project even after VSA reworded it.
      if (field === 'client' || field === 'project') {
        e.projectCode = codeForProject(e.client, e.project);
        tr.querySelector('[data-f="project"]').title = e.project || '';
      }
      updateTotal();
      persist();
    };

    // `input` keeps the total live while typing; `change` also covers pickers
    // and select keyboard navigation.
    el.addEventListener('input', apply);
    el.addEventListener('change', apply);
  }

  tr.querySelector('[data-act="del"]').addEventListener('click', () => {
    entries.splice(entries.indexOf(e), 1);
    persist();
    render();
  });
  return tr;
}

function updateTotal() {
  const shown = entriesForMonth(entries, currentMonth());
  const complete = shown.filter(isComplete).length;
  $('total').textContent = String(totalDays(shown));
  $('row-count').textContent = shown.length
    ? `${complete}/${shown.length} row(s) ready to inject`
    : '';
}

function render() {
  const shown = entriesForMonth(entries, currentMonth());
  rowsEl.replaceChildren(...shown.map((e) => rowTemplate(e)));
  updateTotal();

  $('inject').disabled = catalog.length === 0;
}

// The catalog lives in chrome.storage.local, so a synced list survives page
// reloads, browser restarts and extension reloads. Every path that changes
// `catalog` must go through here.
async function saveCatalog() {
  await chrome.storage.local.set({ catalog });
}

// A sync that fails or times out for one client must not erase what an earlier
// successful sync found for it. Incoming data wins, except that an empty
// project list never replaces a non-empty one -- that case is a failed lookup,
// not a client whose projects genuinely disappeared.
function mergeCatalog(previous, incoming) {
  // Internal activities were synced by earlier versions; drop them so an
  // existing catalog cleans itself up on the next sync.
  const byCode = new Map(previous.filter((c) => !c.internal).map((c) => [c.code, c]));
  for (const c of incoming) {
    const old = byCode.get(c.code);
    const keepOld = old && old.projects.length > 0 && c.projects.length === 0;
    byCode.set(c.code, keepOld ? { ...c, projects: old.projects, stale: true } : c);
  }
  return [...byCode.values()];
}

async function persist() {
  entries = normalize(entries);
  await saveEntries(entries);
}

// Talks to the VSA tab. The content script only runs on the timesheet page, so
// a missing receiver means the user is not on it.
const VSA_TAB_URL = 'https://vsa.example.com/o_services/timesheetspivot*';

const CONTENT_SCRIPTS = [
  'src/content/selectors.js',
  'src/content/widen.js',
  'src/content/inject.js',
  'src/content/main.js',
];

// After the extension is reloaded, tabs opened beforehand still run the old
// content script, or none at all -- messaging them fails with "Receiving end
// does not exist". Rather than make the user reload VSA, inject on demand and
// retry once.
async function sendToVsa(message) {
  const [tab] = await chrome.tabs.query({ url: VSA_TAB_URL });
  if (!tab) throw new Error('Open the VSA timesheet page first, then retry.');

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: CONTENT_SCRIPTS,
    });
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (err) {
      throw new Error(
        `Could not reach the VSA page (${err.message}). Reload the timesheet tab and retry.`
      );
    }
  }
}

$('add-row').addEventListener('click', () => {
  // New rows follow the last one in the month so repeated adds stay in order,
  // rather than all landing on the 1st.
  const shown = entriesForMonth(entries, currentMonth());
  const last = shown.at(-1);
  const day = last ? Math.min(Number(last.date.slice(8, 10)) + 1, daysInMonth(currentMonth())) : 1;
  entries.push({
    date: `${currentMonth()}-${String(day).padStart(2, '0')}`,
    client: last?.client ?? '',
    project: last?.project ?? '',
    projectCode: last?.projectCode,
    days: 1,
    note: '',
  });
  persist();
  render();
});

async function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  await chrome.downloads.download({ url, filename }).catch(() => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  });
}

// Quoted only when needed, with embedded quotes doubled, per RFC 4180.
// Project labels routinely contain commas and brackets.
function csvCell(value) {
  const v = value == null ? '' : String(value);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(rows) {
  const cols = ['date', 'client', 'project', 'projectCode', 'days', 'note'];
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => csvCell(r[c])).join(','));
  }
  // CRLF and a BOM so Excel opens accented client names correctly.
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

$('export').addEventListener('click', async () => {
  await download(
    JSON.stringify({ entries, catalog }, null, 2),
    'vsa-shadow-tracking.json',
    'application/json'
  );
});

// CSV covers the current month only -- it is for reading and sharing, unlike
// the JSON export which is a full backup and can be imported back.
$('export-csv').addEventListener('click', async () => {
  const month = currentMonth();
  const shown = entriesForMonth(entries, month);
  if (!shown.length) return say('Nothing to export for this month.', true);
  await download(toCsv(shown), `vsa-shadow-tracking-${month}.csv`, 'text/csv;charset=utf-8');
  say(`Exported ${shown.length} rows for ${month}.`);
});

$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const parts = [];
    // A catalog-only file (from tools/dump-catalog.js) must not wipe tracked
    // entries, so each half is replaced only when the file actually carries it.
    if (Array.isArray(data.entries)) {
      entries = normalize(data.entries);
      await persist();
      parts.push(`${entries.length} entries`);
    }
    if (Array.isArray(data.catalog)) {
      catalog = data.catalog;
      await saveCatalog();
      const n = catalog.reduce((s, c) => s + c.projects.length, 0);
      parts.push(`${catalog.length} clients, ${n} projects`);
    }
    render();
    say(parts.length ? `Imported ${parts.join(' and ')}.` : 'Nothing to import in that file.', !parts.length);
  } catch (err) {
    say(`Import failed: ${err.message}`, true);
  } finally {
    // Cleared so re-picking the same file fires `change` again.
    e.target.value = '';
  }
});

$('sync').addEventListener('click', async () => {
  say('Syncing catalog from VSA, this walks every client...');
  try {
    const res = await sendToVsa({ type: 'catalog' });
    if (!res?.ok) throw new Error(res?.error || 'no response');
    catalog = mergeCatalog(catalog, res.catalog);
    await saveCatalog();
    render();
    const n = catalog.reduce((s, c) => s + c.projects.length, 0);
    const stale = catalog.filter((c) => c.stale).length;
    say(
      `Catalog synced: ${catalog.length} clients, ${n} projects.` +
        (stale ? ` ${stale} kept from a previous sync (lookup failed this time).` : '')
    );
  } catch (err) {
    say(`Sync failed: ${err.message}`, true);
  }
});

$('inject').addEventListener('click', async () => {
  const all = entriesForMonth(entries, currentMonth());
  const shown = all.filter(isComplete);
  const skipped = all.length - shown.length;
  if (!shown.length) {
    return say('Nothing complete to inject: each row needs a project and days.', true);
  }
  say(`Injecting ${shown.length} entries...`);
  try {
    const res = await sendToVsa({ type: 'inject', entries: shown });
    if (!res?.ok) throw new Error(res?.error || 'no response');
    const bad = res.report.filter((r) => !r.ok);
    const lines = `${res.prepared}/${res.total} lines prepared`;
    if (bad.length) {
      say(
        `${lines}. Failed: ` +
          bad.map((b) => `${b.client} -> ${b.error}`).join('; ') +
          '. No days were written for those lines.',
        true
      );
    } else {
      say(
        `Injected ${shown.length} entries.` +
          (skipped ? ` ${skipped} incomplete row(s) skipped.` : '') +
          ' Review the grid, then press Save in VSA.'
      );
    }
  } catch (err) {
    say(`Injection failed: ${err.message}`, true);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'catalog-progress') {
    say(`Syncing ${msg.index}/${msg.total}: ${msg.client}`);
  }
  if (msg?.type === 'inject-progress') {
    say(
      msg.phase === 'structure'
        ? `Step 1/2, preparing lines ${msg.index}/${msg.total}: ${msg.client}`
        : `Step 2/2, writing days ${msg.index}/${msg.total}: ${msg.client}`
    );
  }
  // Saved and rendered per client, so progress is visible and survives the
  // options page being closed mid-sync.
  if (msg?.type === 'catalog-partial') {
    catalog = mergeCatalog(catalog, msg.catalog);
    saveCatalog();
    render();
  }
});

$('reset-catalog').addEventListener('click', () => {
  const n = catalog.length;
  if (!n) return say('Catalog is already empty.');
  if (confirm(`Clear all ${n} clients and their projects?\n\nTracked entries are not affected.`)) {
    resetCatalog();
  }
});

$('month').addEventListener('change', render);
$('prev-month').addEventListener('click', () => shiftMonth(-1));
$('next-month').addEventListener('click', () => shiftMonth(1));

(async function init() {
  $('month').value = todayMonth;
  entries = await loadEntries();
  catalog = (await chrome.storage.local.get('catalog')).catalog || [];
  render();
  if (catalog.length === 0) {
    say('Open the VSA timesheet page, then sync clients & projects to start.', true);
  } else {
    const n = catalog.reduce((s, c) => s + c.projects.length, 0);
    say(`${catalog.length} clients and ${n} projects loaded.`);
  }
})();
