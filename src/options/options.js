import {
  getLanguage,
  setLanguage,
  getNotesToVsa,
  setNotesToVsa,
  getTimesheetUrl,
  setTimesheetUrl,
  normalizeUrl,
  matchPatternFor,
  originPatternFor,
  getCraSheetName,
  setCraSheetName,
  getCraUrl,
  setCraUrl,
  getHolidaySettings,
  setHolidaySettings,
  URL_NOT_HTTP,
} from '../shared/config.js';
import {
  loadEntries,
  saveEntries,
  entriesForMonth,
  totalDays,
  normalize,
  isComplete,
  monthOf,
  groupByDay,
  dayStatus,
  summarizeDays,
  rangeEntries,
} from '../shared/store.js';
import {
  DEFAULT_HOLIDAY_SETTINGS,
  addDays,
  holidayDefaults,
  normalizeHolidaySettings,
  observedWord,
  rangeDates,
  ruleDays,
  spanDays,
  toggleRule,
} from '../shared/holidays.js';
import { buildCraPayload, serializeCraPayload, buildAdminRows, serializeAdminRows } from '../shared/cra.js';
import { t, tn, formatNumber, localizePage } from '../shared/i18n.js';

const $ = (id) => document.getElementById(id);
const rowsEl = $('rows');
const statusEl = $('status');

let entries = [];
let catalog = [];
// True once a timesheet URL is set and its host permission is granted.
let configured = false;
// The CRA tab name, kept in memory so the copy handler can write the clipboard
// without awaiting storage first. An await before the write can spend the
// click's user activation, which clipboard access requires (strictly so in
// Firefox).
let craSheetName = '';
let holidaySettings = { ...DEFAULT_HOLIDAY_SETTINGS };

// Local date parts, not toISOString(): that is UTC, which is still the previous
// month for the first hour or two of the 1st in France.
const todayMonth = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

// The holiday words that end up in the range preview and the holidays panel.
const HOLIDAY_WORDS = {
  dayOff: t('dayOff'),
  substitute: t('observed_substitute'),
  nearest: t('observed_nearest'),
};

const countryName = (code) => t(`country_${code}`);

// Sentences built from optional parts, each already punctuated.
const sentences = (...parts) => parts.filter(Boolean).join(' ');

// A pasted value that is not a URL at all throws a TypeError from new URL().
function describeUrlError(err) {
  if (err instanceof TypeError) return t('urlInvalid');
  return err.message === URL_NOT_HTTP ? t('urlNotHttp') : err.message;
}

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

// `groups` are extra { label, values } shown under an optgroup; an empty one is
// left out.
function optionsHtml(values, selected, placeholder, groups = []) {
  const option = (v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`;
  const known = values.includes(selected) || groups.some((g) => g.values.includes(selected));
  const opts = [`<option value="">${esc(placeholder)}</option>`];
  if (selected && !known) {
    opts.push(`<option value="${esc(selected)}" selected>${esc(t('notInCatalog', selected))}</option>`);
  }
  opts.push(...values.map(option));
  for (const g of groups) {
    if (g.values.length) opts.push(`<optgroup label="${esc(g.label)}">${g.values.map(option).join('')}</optgroup>`);
  }
  return opts.join('');
}

function isInternal(label) {
  return Boolean(catalog.find((c) => c.label === label)?.internal);
}

// Clients first, then internal activities under their own group, so an
// alternance day is picked the same way as a client day.
function clientOptionsHtml(selected) {
  const clients = catalog.filter((c) => !c.internal).map((c) => c.label);
  const internal = catalog.filter((c) => c.internal).map((c) => c.label);
  return optionsHtml(clients, selected, t('clientPlaceholder'), [{ label: t('internalActivities'), values: internal }]);
}

// Merging never deletes, so a client removed in VSA would linger forever.
// Reset drops everything and forces a clean rebuild on the next sync.
async function resetCatalog() {
  catalog = [];
  await saveCatalog();
  render();
  say(t('catalogCleared'));
}

// Projects are scoped to the selected client. With no client chosen there is
// nothing valid to offer, so the project select stays empty and disabled.
function codeForProject(clientLabel, projectLabel) {
  const c = catalog.find((x) => x.label === clientLabel);
  return c?.projects.find((p) => p.label === projectLabel)?.code;
}

function describeCatalog() {
  const clients = catalog.filter((c) => !c.internal);
  const internal = catalog.length - clients.length;
  const n = clients.reduce((s, c) => s + c.projects.length, 0);
  return [
    tn('catalogClients', clients.length),
    tn('catalogProjects', n),
    ...(internal ? [tn('catalogInternal', internal)] : []),
  ].join(', ');
}

function projectsFor(clientLabel) {
  const c = catalog.find((x) => x.label === clientLabel);
  return c ? c.projects.map((p) => p.label) : [];
}

// An internal activity takes no project, which the placeholder says.
function projectPlaceholder(client) {
  return isInternal(client) ? t('noProject') : t('projectPlaceholder');
}

function fillProjects(tr, client) {
  const sel = tr.querySelector('[data-f="project"]');
  const values = projectsFor(client);
  const current = sel.value;
  sel.innerHTML = optionsHtml(values, values.includes(current) ? current : '', projectPlaceholder(client));
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
    <td><button type="button" class="danger" data-act="del">x</button></td>`;
  const del = tr.querySelector('[data-act="del"]');
  del.title = t('deleteLine');
  del.setAttribute('aria-label', t('deleteLine'));

  const clientSel = tr.querySelector('[data-f="client"]');
  clientSel.innerHTML = clientOptionsHtml(e.client || '');

  const projectSel = tr.querySelector('[data-f="project"]');
  projectSel.innerHTML = optionsHtml(projectsFor(e.client), e.project || '', projectPlaceholder(e.client));
  projectSel.disabled = projectsFor(e.client).length === 0;
  // Labels are longer than the column, so the full text is available on hover.
  projectSel.title = e.project || '';

  for (const el of tr.querySelectorAll('[data-f]')) {
    const field = el.dataset.f;
    if (el.tagName !== 'SELECT') el.value = e[field] ?? '';

    const apply = () => {
      // Days is numeric; everything else is stored as typed.
      e[field] = field === 'days' ? Number(el.value) || 0 : el.value;

      // Changing client invalidates any project from the previous one. The
      // internal flag travels with the entry, so injection and the CRA copy
      // know the line has no project without reading the catalog.
      if (field === 'client') {
        fillProjects(tr, el.value);
        e.project = tr.querySelector('[data-f="project"]').value;
        if (isInternal(el.value)) e.internal = true;
        else delete e.internal;
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

    // A committed new date moves the row to another day group, so the table is
    // rebuilt. An emptied date is left alone: rebuilding would hide the row
    // while it is being corrected.
    if (field === 'date') {
      el.addEventListener('change', () => {
        if (!el.value) return;
        if (monthOf(el.value) !== currentMonth()) say(t('rowMoved', monthOf(el.value)));
        render();
      });
    }
  }

  del.addEventListener('click', () => {
    entries.splice(entries.indexOf(e), 1);
    persist();
    render();
  });
  return tr;
}

function updateTotal() {
  const shown = entriesForMonth(entries, currentMonth());
  const complete = shown.filter(isComplete).length;
  const days = groupByDay(shown);
  $('total-label').textContent = describeMonth(summarizeDays(days));
  refreshDayHeaders(days);
  $('total').textContent = formatDays(totalDays(shown));
  $('row-count').textContent = shown.length ? tn('rowsReady', shown.length, complete) : '';
  // The CRA block needs no VSA configuration, only something complete to send.
  $('copy-cra').disabled = complete === 0;
  $('copy-admin').disabled = complete === 0;
  updateRangePreview();
}

const formatDays = (n) => formatNumber(Number(n.toFixed(3)));

const DAY_STATUS_TEXT = {
  complete: () => t('dayComplete'),
  partial: (total) => t('dayMissing', formatDays(1 - total)),
  over: (total) => t('dayOver', formatDays(total - 1)),
};

function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

// Built with textContent rather than innerHTML: the header needs no markup.
function dayHeaderRow(day) {
  const tr = document.createElement('tr');
  const th = document.createElement('th');
  th.colSpan = 6;
  th.scope = 'rowgroup';
  for (const part of ['label', 'total', 'status']) {
    const span = document.createElement('span');
    span.className = `day-${part}`;
    th.append(span);
  }
  tr.append(th);
  fillDayHeader(tr, day);
  return tr;
}

function fillDayHeader(tr, day) {
  tr.className = `day-group ${day.status}`;
  tr.dataset.date = day.date;
  tr.querySelector('.day-label').textContent = dayLabel(day.date);
  tr.querySelector('.day-total').textContent = `${formatDays(day.total)} / 1`;
  tr.querySelector('.day-status').textContent = DAY_STATUS_TEXT[day.status](day.total);
}

// Totals change while typing without rebuilding the table, which would lose
// focus, so the headers are refreshed in place. A day whose rows all lost their
// date is still on screen until the next rebuild, and shows as empty.
function refreshDayHeaders(days) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const tr of rowsEl.querySelectorAll('tr.day-group')) {
    const date = tr.dataset.date;
    fillDayHeader(tr, byDate.get(date) ?? { date, total: 0, status: dayStatus(0) });
  }
}

function describeMonth({ complete, partial, over }) {
  const parts = [];
  if (complete) parts.push(tn('completeDays', complete));
  if (partial) parts.push(tn('partialDays', partial));
  if (over) parts.push(tn('overDays', over));
  return parts.length ? t('totalOf', parts.join(', ')) : t('total');
}

// Entries are shown grouped by day, each group under a header row with the
// day's total and whether it makes one full day.
function render() {
  const shown = entriesForMonth(entries, currentMonth());
  const rows = [];
  for (const day of groupByDay(shown)) {
    rows.push(dayHeaderRow(day), ...day.entries.map((e) => rowTemplate(e)));
  }
  rowsEl.replaceChildren(...rows);
  refreshRangeCatalog();
  renderHolidays();
  updateTotal();
  updateButtons();
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
  // Internal activities are read from the dropdown in one go, with no lookup
  // that can fail, so every sync carries the full list: the previous ones are
  // dropped, which also clears Absence left by early versions.
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
// No "tabs" permission is needed: querying by URL is allowed for hosts the user
// has granted, and sendMessage/executeScript work on that same tab.
async function sendToVsa(message) {
  const url = await getTimesheetUrl();
  if (!url) throw new Error(t('setUrlFirst'));

  const [tab] = await chrome.tabs.query({ url: matchPatternFor(url) });
  if (!tab) throw new Error(t('openVsaFirst'));

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
      throw new Error(t('cannotReachVsa', err.message));
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
    ...(last?.internal ? { internal: true } : {}),
    days: 1,
    note: '',
  });
  persist();
  render();
});

// ---- Range entry -------------------------------------------------------------

// One form, one row per day: the same client, project and days over a span of
// dates. Weekends and bank holidays are left out unless the user ticks them.
// The span from start to end is capped, weekends included: a month and a bit is
// plenty, and beyond that a typo in a year is more likely than intent. Checking
// the span first also spares walking centuries of days on every keystroke.
const RANGE_MAX_DAYS = 62;

function fillRangeProjects(selected) {
  const client = $('range-client').value;
  const values = projectsFor(client);
  const sel = $('range-project');
  sel.innerHTML = optionsHtml(values, values.includes(selected) ? selected : '', projectPlaceholder(client));
  sel.disabled = values.length === 0;
  sel.title = sel.value;
}

// Keeps the panel's selects in step with the catalog after a sync, reset or
// import, without losing what the user already picked.
function refreshRangeCatalog() {
  if ($('range').hidden) return;
  const project = $('range-project').value;
  $('range-client').innerHTML = clientOptionsHtml($('range-client').value);
  fillRangeProjects(project);
}

function rangeTemplate() {
  const client = $('range-client').value;
  const project = $('range-project').value;
  return {
    client,
    project,
    projectCode: codeForProject(client, project),
    internal: isInternal(client),
    days: Number($('range-days').value) || 0,
    note: $('range-note').value.trim(),
  };
}

function computeRange() {
  const span = spanDays($('range-from').value, $('range-to').value);
  if (span > RANGE_MAX_DAYS) return { dates: [], skipped: [], span };
  const range = rangeDates(
    $('range-from').value,
    $('range-to').value,
    { weekends: $('range-weekends').checked, holidays: $('range-holidays').checked, words: HOLIDAY_WORDS },
    holidaySettings
  );
  return { ...range, span };
}

function rangeProblem(line, { dates, span }) {
  const from = $('range-from').value;
  const to = $('range-to').value;
  if (!line.client) return t('rangeNeedClient');
  if (!line.internal && !line.project) return t('rangeNeedProject');
  if (!(line.days > 0 && line.days <= 1)) return t('rangeBadDays');
  if (!from || !to) return t('rangeNeedDates');
  if (from > to) return t('rangeInverted');
  if (span > RANGE_MAX_DAYS) return t('rangeTooLong', span, RANGE_MAX_DAYS);
  if (!dates.length) return t('rangeEmpty');
  return '';
}

const listDays = (dates) =>
  dates.length <= 7 ? dates.map(dayLabel).join('; ') : `${dayLabel(dates[0])} ... ${dayLabel(dates.at(-1))}`;

function setHint(el, msg, color) {
  el.textContent = msg;
  el.style.color = color || '';
}

function updateRangePreview() {
  if ($('range').hidden) return;
  const line = rangeTemplate();
  const range = computeRange();
  const { dates, skipped } = range;
  const problem = rangeProblem(line, range);
  const submit = $('range-submit');
  submit.disabled = Boolean(problem);
  submit.textContent = problem ? t('addRows') : tn('addCountRows', dates.length);

  if (problem) {
    setHint($('range-preview'), problem, '#c33');
  } else {
    // Warned, not refused: a day can legitimately be over while the user is
    // still moving time around.
    const totals = new Map(groupByDay(entries).map((d) => [d.date, d.total]));
    const over = dates.filter((d) => (totals.get(d) ?? 0) + line.days > 1 + 1e-9);
    setHint(
      $('range-preview'),
      sentences(
        tn('rangeRows', dates.length, listDays(dates)),
        over.length && tn('rangeOver', over.length, listDays(over))
      ),
      over.length ? '#c60' : ''
    );
  }

  const weekends = skipped.filter((s) => s.reason === 'weekend').length;
  const holidays = skipped.filter((s) => s.reason !== 'weekend').map((s) => `${dayLabel(s.date)} ${s.reason}`);
  const parts = [...(weekends ? [tn('weekendDays', weekends)] : []), ...holidays];
  setHint($('range-skipped'), parts.length ? t('rangeSkipped', parts.join('; ')) : '');
}

// Prefilled like Add row: the last row's client, project and days, starting the
// day after it. Both options start unticked every time.
$('add-range').addEventListener('click', () => {
  const last = entriesForMonth(entries, currentMonth()).at(-1);
  const from = last ? addDays(last.date, 1) : `${currentMonth()}-01`;
  $('range-client').innerHTML = clientOptionsHtml(last?.client ?? '');
  fillRangeProjects(last?.project ?? '');
  $('range-days').value = last?.days || 1;
  $('range-note').value = '';
  $('range-from').value = from;
  $('range-to').value = from;
  $('range-weekends').checked = false;
  $('range-holidays').checked = false;
  $('range').hidden = false;
  updateRangePreview();
  $('range').scrollIntoView({ block: 'nearest' });
  $('range-client').focus();
});

$('range-client').addEventListener('change', () => {
  fillRangeProjects('');
  updateRangePreview();
});

for (const id of ['range-project', 'range-days', 'range-note', 'range-from', 'range-to', 'range-weekends', 'range-holidays']) {
  $(id).addEventListener('input', updateRangePreview);
  $(id).addEventListener('change', updateRangePreview);
}
$('range-project').addEventListener('change', () => ($('range-project').title = $('range-project').value));

$('range-cancel').addEventListener('click', () => {
  $('range').hidden = true;
});

// The panel stays open so several ranges can be chained, for instance two half
// days on different projects over the same week.
$('range-submit').addEventListener('click', () => {
  const line = rangeTemplate();
  const range = computeRange();
  const { dates } = range;
  const problem = rangeProblem(line, range);
  if (problem) return say(problem, true);
  entries.push(...rangeEntries(line, dates));
  persist();
  render();
  const elsewhere = dates.filter((d) => monthOf(d) !== currentMonth());
  const months = [...new Set(elsewhere.map(monthOf))];
  say(
    sentences(
      tn('rangeAdded', dates.length, dayLabel(dates[0]), dayLabel(dates.at(-1))),
      elsewhere.length && t('rangeElsewhere', elsewhere.length, months.join(', '))
    )
  );
});

// ---- Public holidays ---------------------------------------------------------

function holidayCell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

const fullDate = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// Shown for the year of the displayed month, so the dates follow < and >.
function renderHolidays() {
  // The lists are rebuilt, so a focused rule checkbox is focused again by id:
  // otherwise a keyboard user toggling rules is sent back to the top each time.
  const focused = $('holidays').contains(document.activeElement) ? document.activeElement.id : '';
  const year = Number(currentMonth().slice(0, 4));
  $('holidays-country').textContent = countryName(holidaySettings.country);
  $('holidays-year').textContent = `(${year})`;
  const word = observedWord(holidaySettings.country, HOLIDAY_WORDS);

  $('holiday-rules').replaceChildren(
    ...ruleDays(year, holidaySettings).map(({ rule, on, date, off }) => {
      const tr = document.createElement('tr');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = `holiday-${rule.id}`;
      box.checked = on;
      box.addEventListener('change', () => saveHolidays(toggleRule(holidaySettings, rule.id, box.checked)));
      const label = document.createElement('label');
      label.htmlFor = box.id;
      label.textContent = rule.label;
      const first = document.createElement('td');
      first.append(box, ' ', label);
      // A weekend holiday shifted to a weekday shows the day actually off.
      const shifted = off && off !== date ? ` (${word} ${fullDate(off)})` : '';
      tr.append(first, holidayCell(fullDate(date) + shifted));
      return tr;
    })
  );

  const custom = holidaySettings.custom.map((c) => {
    const tr = document.createElement('tr');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = 'x';
    del.title = t('removeDayOff');
    del.setAttribute('aria-label', t('removeDayOff'));
    del.addEventListener('click', () =>
      saveHolidays({ ...holidaySettings, custom: holidaySettings.custom.filter((x) => x.date !== c.date) })
    );
    const last = document.createElement('td');
    last.append(del);
    tr.append(holidayCell(fullDate(c.date)), holidayCell(c.label || HOLIDAY_WORDS.dayOff), last);
    return tr;
  });
  $('holiday-custom').replaceChildren(...(custom.length ? custom : [holidayRow(t('noneYet'))]));
  if (focused) $(focused)?.focus();
}

function holidayRow(text) {
  const tr = document.createElement('tr');
  tr.append(holidayCell(text));
  return tr;
}

// The in-memory settings change before the write, so a second toggle made
// while the first is still being stored builds on it instead of undoing it.
async function saveHolidays(next, message) {
  holidaySettings = normalizeHolidaySettings(next);
  renderHolidays();
  updateRangePreview();
  await setHolidaySettings(holidaySettings);
  if (message) say(message);
}

// Adding a date that is already listed replaces its label.
$('custom-add').addEventListener('click', async () => {
  const date = $('custom-date').value;
  if (!date) return say(t('pickDayOffDate'), true);
  const label = $('custom-label').value.trim();
  await saveHolidays(
    { ...holidaySettings, custom: [...holidaySettings.custom.filter((c) => c.date !== date), { date, label }] },
    t('dayOffAdded', fullDate(date))
  );
  $('custom-date').value = '';
  $('custom-label').value = '';
});

// Each button swaps in a country's default list. Custom days off go too: they
// were chosen against the previous list.
for (const btn of document.querySelectorAll('[data-holidays-reset]')) {
  btn.addEventListener('click', () => {
    const name = countryName(btn.dataset.holidaysReset);
    if (confirm(t('confirmHolidaysReset', name))) {
      saveHolidays(holidayDefaults(btn.dataset.holidaysReset), t('holidaysReset', name));
    }
  });
}

// A plain anchor is enough on an extension page, so no downloads permission is
// needed. The object URL is revoked once the click has been handled.
function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
  download(
    JSON.stringify({ entries, catalog, holidays: holidaySettings }, null, 2),
    'vsa-shadow-tracking.json',
    'application/json'
  );
});

// CSV covers the current month only -- it is for reading and sharing, unlike
// the JSON export which is a full backup and can be imported back.
$('export-csv').addEventListener('click', async () => {
  const month = currentMonth();
  const shown = entriesForMonth(entries, month);
  if (!shown.length) return say(t('nothingToExport'), true);
  download(toCsv(shown), `vsa-shadow-tracking-${month}.csv`, 'text/csv;charset=utf-8');
  say(tn('exported', shown.length, month));
});

// The team CRA workbook takes the month as one line of JSON pasted into a cell
// of the user's tab; an Office Script there does the writing (tools/cra-import).
// Copying is refused, not trimmed, when a row cannot become whole hours: the
// workbook would refuse it anyway, and later, with less context.
$('copy-cra').addEventListener('click', async () => {
  const month = currentMonth();
  const person = craSheetName;
  const { payload, problems, hours, skipped } = buildCraPayload(entries, { month, person });
  if (problems.length) {
    const list = problems.map((p) => t('craProblem', p.date, p.project, formatNumber(p.days), formatNumber(p.hours)));
    return say(t('cannotCopy', list.join('; ')), true);
  }
  if (!payload.rows.length) return say(t('nothingCompleteToCopy'), true);
  const text = serializeCraPayload(payload);
  const fallback = $('cra-fallback');
  try {
    await navigator.clipboard.writeText(text);
    fallback.hidden = true;
    say(
      sentences(
        tn('craCopied', payload.rows.length, month, formatNumber(hours)),
        skipped && tn('incompleteSkipped', skipped),
        t('craPasteHint')
      )
    );
  } catch {
    fallback.value = text;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    say(t('craClipboardFailed'), true);
  }
});

// The workbook refuses a project its Admin referential does not know. This hands
// the month's projects to whoever keeps that referential, as rows that paste
// straight into the Admin table (Client, Numéro, Projet, Type, Actif).
$('copy-admin').addEventListener('click', async () => {
  const month = currentMonth();
  const { rows, skipped, internal } = buildAdminRows(entries, { month });
  if (!rows.length) {
    return say(internal ? t('adminNothingInternal') : t('adminNothing'), true);
  }
  const text = serializeAdminRows(rows);
  const fallback = $('cra-fallback');
  try {
    await navigator.clipboard.writeText(text);
    fallback.hidden = true;
    say(
      sentences(
        tn('adminCopied', rows.length, month),
        skipped && tn('incompleteSkipped', skipped),
        internal && tn('internalLeftOut', internal),
        t('adminPasteHint')
      )
    );
  } catch {
    fallback.value = text;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    say(t('adminClipboardFailed'), true);
  }
});

// An Open button targets the saved URL, never the unsaved text in its field,
// and stays disabled until there is one. Saved values are already normalised to
// http(s) by config.js, so nothing else can be opened.
function setOpenButton(id, url) {
  const btn = $(id);
  btn.dataset.url = url || '';
  btn.disabled = !url;
  btn.title = url || t('saveUrlFirst');
}

for (const id of ['open-timesheet', 'cra-open']) {
  $(id).addEventListener('click', () => {
    const url = $(id).dataset.url;
    if (url) window.open(url, '_blank', 'noopener');
  });
}

$('cra-sheet').addEventListener('change', async () => {
  craSheetName = $('cra-sheet').value.trim();
  await setCraSheetName(craSheetName);
  setUrlStatus(t('craTabSaved'), false);
});

$('cra-url').addEventListener('change', async () => {
  try {
    await setCraUrl($('cra-url').value);
    const url = await getCraUrl();
    $('cra-url').value = url;
    setOpenButton('cra-open', url);
    setUrlStatus(url ? t('craLinkSaved') : t('craLinkCleared'), false);
  } catch (err) {
    setUrlStatus(describeUrlError(err), true);
  }
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
      parts.push(tn('importedEntries', entries.length));
    }
    if (Array.isArray(data.catalog)) {
      catalog = data.catalog;
      await saveCatalog();
      const n = catalog.reduce((s, c) => s + c.projects.length, 0);
      parts.push(`${tn('catalogClients', catalog.length)}, ${tn('catalogProjects', n)}`);
    }
    if (data.holidays && typeof data.holidays === 'object' && !Array.isArray(data.holidays)) {
      holidaySettings = await setHolidaySettings(data.holidays);
      parts.push(t('importedHolidays'));
    }
    render();
    const list = parts.length > 1 ? t('listAnd', parts.slice(0, -1).join(', '), parts.at(-1)) : parts[0];
    say(parts.length ? t('imported', list) : t('nothingToImport'), !parts.length);
  } catch (err) {
    say(t('importFailed', err.message), true);
  } finally {
    // Cleared so re-picking the same file fires `change` again.
    e.target.value = '';
  }
});

$('sync').addEventListener('click', async () => {
  say(t('syncing'));
  try {
    const res = await sendToVsa({ type: 'catalog' });
    if (!res?.ok) throw new Error(res?.error || t('noResponse'));
    catalog = mergeCatalog(catalog, res.catalog);
    await saveCatalog();
    render();
    const stale = catalog.filter((c) => c.stale).length;
    say(sentences(t('catalogSynced', describeCatalog()), stale && tn('staleKept', stale)));
  } catch (err) {
    say(t('syncFailed', err.message), true);
  }
});

$('inject').addEventListener('click', async () => {
  const all = entriesForMonth(entries, currentMonth());
  const shown = all.filter(isComplete);
  const skipped = all.length - shown.length;
  if (!shown.length) {
    return say(t('nothingToInject'), true);
  }
  say(tn('injecting', shown.length));
  try {
    const sendNotes = await getNotesToVsa();
    const res = await sendToVsa({ type: 'inject', entries: shown, options: { sendNotes } });
    if (!res?.ok) throw new Error(res?.error || t('noResponse'));
    const bad = res.report.filter((r) => !r.ok);
    if (bad.length) {
      const failures = bad.map((b) => `${b.client} -> ${b.error}`).join('; ');
      say(t('injectPartial', res.prepared, res.total, failures), true);
    } else {
      const comments = res.report.reduce((sum, r) => sum + (r.comments || 0), 0);
      say(
        sentences(
          tn('injected', shown.length),
          sendNotes && tn('commentsWritten', comments),
          skipped && tn('incompleteSkipped', skipped),
          t('reviewAndSave')
        )
      );
    }
  } catch (err) {
    say(t('injectFailed', err.message), true);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'catalog-progress') {
    say(t('syncProgress', msg.index, msg.total, msg.client));
  }
  if (msg?.type === 'inject-progress') {
    say(
      msg.phase === 'structure'
        ? t('injectStructure', msg.index, msg.total, msg.client)
        : t('injectDays', msg.index, msg.total, msg.client)
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
  if (!n) return say(t('catalogAlreadyEmpty'));
  if (confirm(tn('confirmResetCatalog', n))) {
    resetCatalog();
  }
});

// Chrome only grants host permissions from a user gesture, so this must run
// directly in the click handler rather than after an await chain.
$('save-url').addEventListener('click', async () => {
  const raw = $('timesheet-url').value.trim();
  if (!raw) return setUrlStatus(t('enterUrl'), true);

  let origins;
  try {
    origins = [originPatternFor(raw)];
  } catch (err) {
    return setUrlStatus(describeUrlError(err), true);
  }

  const granted = await chrome.permissions.request({ origins });
  if (!granted) {
    return setUrlStatus(t('accessDenied'), true);
  }

  await setTimesheetUrl(raw);
  const res = await chrome.runtime.sendMessage({ type: 'sync-registration' });
  if (!res?.ok || !res.registered) {
    return setUrlStatus(t('activationFailed', res?.error || res?.reason), true);
  }
  await refreshSetup();
  setUrlStatus(t('savedOpenAndSync'), false);
});

function setUrlStatus(msg, isError) {
  const el = $('url-status');
  el.textContent = msg;
  el.style.color = isError ? '#c33' : '#2a7';
}

// Reflects the configured URL and whether the extension is active for it.
async function refreshSetup() {
  const url = await getTimesheetUrl();
  $('timesheet-url').value = url;
  setOpenButton('open-timesheet', url);
  $('language').value = await getLanguage();
  $('notes-to-vsa').checked = await getNotesToVsa();
  // CRA preferences are independent of the VSA site, so they load before the
  // early return below. Both the field and the Open button are restored: a field
  // left empty invites retyping, and a typo would silently replace a good value.
  craSheetName = await getCraSheetName();
  $('cra-sheet').value = craSheetName;
  const craUrl = await getCraUrl();
  $('cra-url').value = craUrl;
  setOpenButton('cra-open', craUrl);
  $('setup').classList.toggle('unset', !url);

  if (!url) {
    configured = false;
    updateButtons();
    setUrlStatus(t('pasteUrlToBegin'), false);
    return false;
  }

  configured = await chrome.permissions.contains({ origins: [originPatternFor(url)] });
  updateButtons();
  if (!configured) {
    setUrlStatus(t('accessRevoked'), true);
  }
  return configured;
}

// Sync needs a configured site; inject additionally needs a synced catalog.
function updateButtons() {
  $('sync').disabled = !configured;
  $('inject').disabled = !configured || catalog.length === 0;
}

// Stored immediately; the content script picks the change up via
// chrome.storage.onChanged, so no reload is needed.
$('language').addEventListener('change', async () => {
  await setLanguage($('language').value);
  setUrlStatus(t('languageSaved'), false);
});

$('notes-to-vsa').addEventListener('change', async () => {
  await setNotesToVsa($('notes-to-vsa').checked);
  setUrlStatus(
    $('notes-to-vsa').checked ? t('notesOn') : t('notesOff'),
    false
  );
});

$('month').addEventListener('change', render);
$('prev-month').addEventListener('click', () => shiftMonth(-1));
$('next-month').addEventListener('click', () => shiftMonth(1));

(async function init() {
  localizePage();
  $('month').value = todayMonth;
  entries = await loadEntries();
  catalog = (await chrome.storage.local.get('catalog')).catalog || [];
  holidaySettings = await getHolidaySettings();
  const ready = await refreshSetup();
  // Settings start collapsed once the extension can reach VSA. They stay open
  // when there is something to do: no URL yet, or site access revoked, whose
  // message is shown inside.
  $('setup').open = !ready;
  render();
  if (!ready) return;
  if (catalog.length === 0) {
    say(t('startSync'), true);
  } else {
    say(t('catalogLoaded', describeCatalog()));
  }
})();
