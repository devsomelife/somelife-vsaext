// Goal 2: write preloaded entries into the VSA grid, and read back the
// client/project catalog so the options page can offer real choices.
//
// Both go through the page's own machinery rather than the network:
// setting select.value and firing the inline onchange is exactly what a manual
// click does, so VSA's internal state stays consistent and Save works normally.
// Nothing is submitted; the user still presses Save.

const SETTLE_MS = 400;
const HOURS_PER_DAY = 7;
const LIST_TIMEOUT_MS = 8000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// VSA loads the project list asynchronously and reveals the select only once
// it has options; while it is empty the element stays display:none. Polling
// visibility therefore separates "loaded but empty" from "still loading",
// which counting options alone cannot do.
async function waitForOptions(sel, timeout = LIST_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const el = document.querySelector(sel);
    if (el && el.options.length > 0 && el.offsetParent !== null) return el;
    await sleep(120);
  }
  return document.querySelector(sel);
}

function fire(el, type) {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

// Selecting an activity triggers the inline onchange (getBdc) that fetches the
// projects for that client. Calling the handler directly is more reliable than
// a synthetic event, since VSA binds it as an attribute.
async function chooseActivity(row, label) {
  const act = document.getElementById(`tiers_${row}`);
  if (!act) throw new Error(`row ${row}: activity select missing`);
  const opt = VSA.activityOptionByLabel(act, label);
  if (!opt) throw new Error(`unknown client "${label}"`);

  if (act.value !== opt.value) {
    act.value = opt.value;
    if (typeof act.onchange === 'function') act.onchange();
    else fire(act, 'change');
    await waitForOptions(VSA.projectSelectFor(row));
  }
  return act;
}

async function chooseProject(row, projectLabel) {
  const sel = await waitForOptions(VSA.projectSelectFor(row));
  if (!sel) throw new Error(`row ${row}: project list did not load`);
  // Projects read like "BS-26-000112 [Projet Principal]", so match on prefix.
  const opt =
    [...sel.options].find((o) => o.text.trim() === projectLabel.trim()) ||
    [...sel.options].find((o) => o.text.trim().startsWith(projectLabel.trim()));
  if (!opt) throw new Error(`unknown project "${projectLabel}"`);
  sel.value = opt.value;
  if (typeof sel.onchange === 'function') sel.onchange();
  else fire(sel, 'change');
  await sleep(SETTLE_MS);
  return sel;
}

// A line shows either days or hours; writing the wrong field silently no-ops.
function writeDay(row, dayNumber, days) {
  const format = document.getElementById(`input_format_${row}`);
  const asHours = format && format.value === 'HOUR';
  const id = asHours
    ? VSA.hourInputId(row, dayNumber)
    : VSA.dayInputId(row, dayNumber);
  const input = document.getElementById(id);
  if (!input) throw new Error(`row ${row}: no cell for day ${dayNumber}`);

  input.value = asHours ? String(Number(days) * HOURS_PER_DAY) : String(days);
  fire(input, 'input');
  fire(input, 'change');
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  return { field: id, wrote: input.value, unit: asHours ? 'hour' : 'day' };
}

// Entries are grouped per client+project: one VSA line carries a whole month,
// so we reuse a line rather than creating one per day.
function groupByLine(entries) {
  const byKey = new Map();
  for (const e of entries) {
    const key = `${e.client}||${e.project}`;
    if (!byKey.has(key)) byKey.set(key, { client: e.client, project: e.project, days: [] });
    byKey.get(key).days.push(e);
  }
  return [...byKey.values()];
}

function dayNumber(dateStr) {
  return Number(dateStr.slice(8, 10));
}

// VSA starts with a single empty line, so a month spanning several
// client/project pairs needs extra lines. Clicking "+" is the only supported
// way to create one; we wait for the new row id to appear.
async function addLine() {
  const before = new Set(VSA.allRows());
  const btn = document.querySelector(VSA.addLineButton);
  if (!btn) throw new Error('add-line button not found');
  btn.click();

  const started = Date.now();
  while (Date.now() - started < LIST_TIMEOUT_MS) {
    const fresh = VSA.allRows().find((r) => !before.has(r));
    if (fresh) return fresh;
    await sleep(150);
  }
  throw new Error('new timesheet line did not appear');
}

// Fills the grid without saving. Returns a per-entry report so the options page
// can show exactly what landed and what did not.
async function injectEntries(entries) {
  const report = [];
  const groups = groupByLine(entries);

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    let row = VSA.allRows()[i];
    try {
      if (!row) row = await addLine();
      await chooseActivity(row, g.client);
      await chooseProject(row, g.project);
      for (const e of g.days) {
        writeDay(row, dayNumber(e.date), e.days);
      }
      report.push({ client: g.client, project: g.project, row, ok: true, count: g.days.length });
    } catch (err) {
      report.push({ client: g.client, project: g.project, row, ok: false, error: String(err.message || err) });
    }
  }
  return report;
}

// Catalog sync: walk every client in the activity dropdown and collect the
// project list VSA returns for it. Uses the first line as a scratch row and
// restores its original value afterwards.
async function fetchCatalog(onProgress, onPartial) {
  const row = VSA.allRows()[0];
  if (!row) throw new Error('no timesheet line on this page');
  const act = document.getElementById(`tiers_${row}`);
  const original = act.value;

  // Only "C-" codes are clients with a project list behind them. "I-" codes are
  // internal activities (Absence, Formation...) which are still trackable but
  // have no projects, so probing them would just burn one timeout each.
  const all = [...act.options]
    .map((o) => ({ label: o.text.trim(), code: o.value }))
    .filter((c) => c.code && c.code !== 'I-INTERNE');

  const catalog = all
    .filter((c) => !c.code.startsWith('C-'))
    .map((c) => ({ ...c, internal: true, projects: [] }));

  const clients = all.filter((c) => c.code.startsWith('C-'));

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    if (onProgress) onProgress({ index: i + 1, total: clients.length, client: c.label });
    try {
      act.value = c.code;
      if (typeof act.onchange === 'function') act.onchange();
      else fire(act, 'change');
      const sel = await waitForOptions(VSA.projectSelectFor(row));
      const projects = sel
        ? [...sel.options].map((o) => ({ label: o.text.trim(), code: o.value })).filter((p) => p.code)
        : [];
      catalog.push({ ...c, internal: false, projects });
    } catch (err) {
      catalog.push({ ...c, internal: false, projects: [], error: String(err.message || err) });
    }
    // Hand back what we have after every client, so closing the options page
    // mid-sync keeps the work already done instead of discarding all of it.
    if (onPartial) onPartial(sortCatalog(catalog));
  }

  act.value = original;
  if (typeof act.onchange === 'function') act.onchange();
  return sortCatalog(catalog);
}

// Clients first, then internal activities; alphabetical within each group.
function sortCatalog(catalog) {
  return [...catalog].sort((a, b) => {
    if (a.internal !== b.internal) return a.internal ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}

globalThis.VsaInject = { injectEntries, fetchCatalog, writeDay, groupByLine };
