import { loadEntries, saveEntries, entriesForMonth, totalDays, normalize } from '../shared/store.js';

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

// Projects are scoped to the selected client. With no client chosen there is
// nothing valid to offer, so the project select stays empty and disabled.
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
    <td class="days"><input data-f="days" type="number" step="0.25" min="0" max="1"></td>
    <td><input data-f="note"></td>
    <td><button type="button" data-act="del">x</button></td>`;

  const clientSel = tr.querySelector('[data-f="client"]');
  clientSel.innerHTML = optionsHtml(clientLabels(), e.client || '', 'Client...');

  const projectSel = tr.querySelector('[data-f="project"]');
  projectSel.innerHTML = optionsHtml(projectsFor(e.client), e.project || '', 'Project...');
  projectSel.disabled = projectsFor(e.client).length === 0;

  for (const el of tr.querySelectorAll('[data-f]')) {
    if (el.tagName !== 'SELECT') el.value = e[el.dataset.f] ?? '';
    el.addEventListener('change', () => {
      e[el.dataset.f] = el.value;
      // Changing client invalidates any project from the previous one.
      if (el.dataset.f === 'client') {
        fillProjects(tr, el.value);
        e.project = tr.querySelector('[data-f="project"]').value;
      }
      persist();
      $('total').textContent = String(totalDays(entriesForMonth(entries, currentMonth())));
    });
  }

  tr.querySelector('[data-act="del"]').addEventListener('click', () => {
    entries.splice(entries.indexOf(e), 1);
    persist();
    render();
  });
  return tr;
}

function render() {
  const shown = entriesForMonth(entries, currentMonth());
  rowsEl.replaceChildren(...shown.map((e) => rowTemplate(e)));
  $('total').textContent = String(totalDays(shown));

  $('inject').disabled = catalog.length === 0;
}

// The catalog lives in chrome.storage.local, so a synced list survives page
// reloads, browser restarts and extension reloads. Every path that changes
// `catalog` must go through here.
async function saveCatalog() {
  await chrome.storage.local.set({ catalog });
}

async function persist() {
  entries = normalize(entries);
  await saveEntries(entries);
}

// Talks to the VSA tab. The content script only runs on the timesheet page, so
// a missing receiver means the user is not on it.
async function sendToVsa(message) {
  const [tab] = await chrome.tabs.query({
    url: 'https://vsa.example.com/o_services/timesheetspivot/*',
  });
  if (!tab) throw new Error('Open the VSA timesheet page first.');
  return chrome.tabs.sendMessage(tab.id, message);
}

$('add-row').addEventListener('click', () => {
  entries.push({ date: `${currentMonth()}-01`, client: '', project: '', days: 1, note: '' });
  render();
});

// Weekday fill: seeds one entry per working day, copying the last row's
// client/project so a full month is two clicks away.
$('fill-month').addEventListener('click', () => {
  const month = currentMonth();
  const [y, m] = month.split('-').map(Number);
  const last = entriesForMonth(entries, month).at(-1) || { client: '', project: '' };
  const days = new Date(y, m, 0).getDate();
  const existing = new Set(entriesForMonth(entries, month).map((e) => e.date));

  for (let d = 1; d <= days; d++) {
    const dt = new Date(y, m - 1, d);
    if (dt.getDay() === 0 || dt.getDay() === 6) continue;
    const date = `${month}-${String(d).padStart(2, '0')}`;
    if (existing.has(date)) continue;
    entries.push({ date, client: last.client, project: last.project, days: 1, note: '' });
  }
  persist().then(render);
  say('Weekdays filled.');
});

$('export').addEventListener('click', async () => {
  const blob = new Blob([JSON.stringify({ entries, catalog }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: 'vsa-shadow-tracking.json' }).catch(() => {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vsa-shadow-tracking.json';
    a.click();
  });
});

$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    entries = normalize(data.entries || []);
    if (data.catalog) {
      catalog = data.catalog;
      await saveCatalog();
    }
    await persist();
    render();
    say('Imported.');
  } catch (err) {
    say(`Import failed: ${err.message}`, true);
  }
});

$('sync').addEventListener('click', async () => {
  say('Syncing catalog from VSA, this walks every client...');
  try {
    const res = await sendToVsa({ type: 'catalog' });
    if (!res?.ok) throw new Error(res?.error || 'no response');
    catalog = res.catalog;
    await saveCatalog();
    render();
    const n = catalog.reduce((s, c) => s + c.projects.length, 0);
    say(`Catalog synced: ${catalog.length} clients, ${n} projects.`);
  } catch (err) {
    say(`Sync failed: ${err.message}`, true);
  }
});

$('inject').addEventListener('click', async () => {
  const shown = entriesForMonth(entries, currentMonth());
  if (!shown.length) return say('Nothing to inject for this month.', true);
  say(`Injecting ${shown.length} entries...`);
  try {
    const res = await sendToVsa({ type: 'inject', entries: shown });
    if (!res?.ok) throw new Error(res?.error || 'no response');
    const bad = res.report.filter((r) => !r.ok);
    if (bad.length) {
      say(`Injected with problems: ${bad.map((b) => `${b.client}/${b.project}: ${b.error}`).join('; ')}`, true);
    } else {
      say(`Injected ${shown.length} entries. Review the grid, then press Save in VSA.`);
    }
  } catch (err) {
    say(`Injection failed: ${err.message}`, true);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'catalog-progress') {
    say(`Syncing ${msg.index}/${msg.total}: ${msg.client}`);
  }
  // Saved and rendered per client, so progress is visible and survives the
  // options page being closed mid-sync.
  if (msg?.type === 'catalog-partial') {
    catalog = msg.catalog;
    saveCatalog();
    render();
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
