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

// Datalists let the client/project cells offer real VSA values while still
// accepting free text, so the grid stays usable before a catalog sync.
function datalists() {
  const clients = catalog.map((c) => c.label);
  const projects = [...new Set(catalog.flatMap((c) => c.projects.map((p) => p.label)))];
  return { clients, projects };
}

function projectsFor(clientLabel) {
  const c = catalog.find((x) => x.label === clientLabel);
  return c ? c.projects.map((p) => p.label) : datalists().projects;
}

function rowTemplate(e, i) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="date" data-f="date"></td>
    <td><input data-f="client" list="dl-clients"></td>
    <td><input data-f="project" list="dl-projects-${i}"><datalist id="dl-projects-${i}"></datalist></td>
    <td class="days"><input data-f="days" type="number" step="0.25" min="0" max="1"></td>
    <td><input data-f="note"></td>
    <td><button type="button" data-act="del">x</button></td>`;

  for (const el of tr.querySelectorAll('[data-f]')) {
    el.value = e[el.dataset.f] ?? '';
    el.addEventListener('change', () => {
      e[el.dataset.f] = el.value;
      if (el.dataset.f === 'client') fillProjects(tr, el.value, i);
      persist();
    });
  }
  fillProjects(tr, e.client, i);

  tr.querySelector('[data-act="del"]').addEventListener('click', () => {
    entries.splice(entries.indexOf(e), 1);
    persist();
    render();
  });
  return tr;
}

function fillProjects(tr, client, i) {
  const dl = tr.querySelector(`#dl-projects-${i}`);
  if (!dl) return;
  dl.innerHTML = projectsFor(client).map((p) => `<option value="${p}">`).join('');
}

function render() {
  const month = currentMonth();
  const shown = entriesForMonth(entries, month);

  let dl = $('dl-clients');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'dl-clients';
    document.body.append(dl);
  }
  dl.innerHTML = datalists().clients.map((c) => `<option value="${c}">`).join('');

  rowsEl.replaceChildren(...shown.map(rowTemplate));
  $('total').textContent = String(totalDays(shown));
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
    if (data.catalog) catalog = data.catalog;
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
    await chrome.storage.local.set({ catalog });
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
});

$('month').addEventListener('change', render);
$('prev-month').addEventListener('click', () => shiftMonth(-1));
$('next-month').addEventListener('click', () => shiftMonth(1));

(async function init() {
  $('month').value = todayMonth;
  entries = await loadEntries();
  catalog = (await chrome.storage.local.get('catalog')).catalog || [];
  render();
})();
