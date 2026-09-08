// Goal 2: write preloaded entries into the VSA grid, and read back the
// client/project catalog so the options page can offer real choices.
//
// Both go through the page's own machinery rather than the network:
// setting select.value and firing the inline onchange is exactly what a manual
// click does, so VSA's internal state stays consistent and Save works normally.
// Nothing is submitted; the user still presses Save.

const SETTLE_MS = 400;
const LIST_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// VSA loads the project list asynchronously after the activity changes, so we
// poll the dependent select instead of guessing a fixed delay.
async function waitForOptions(sel, timeout = LIST_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const el = document.querySelector(sel);
    if (el && el.options.length > 0) return el;
    await sleep(150);
  }
  return null;
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
  const sel = asHours
    ? VSA.hourInput(row, dayNumber)
    : VSA.dayInput(row, dayNumber);
  const input = document.querySelector(sel);
  if (!input) throw new Error(`row ${row}: no cell for day ${dayNumber}`);

  input.value = asHours ? String(Number(days) * 7) : String(days);
  fire(input, 'input');
  fire(input, 'change');
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  return { field: sel, wrote: input.value, unit: asHours ? 'hour' : 'day' };
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

// Fills the grid without saving. Returns a per-entry report so the options page
// can show exactly what landed and what did not.
async function injectEntries(entries) {
  const report = [];
  const rows = VSA.allRows();
  const groups = groupByLine(entries);

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const row = rows[i];
    if (!row) {
      report.push({ ...g, ok: false, error: 'no free timesheet line; add one in VSA first' });
      continue;
    }
    try {
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
async function fetchCatalog(onProgress) {
  const row = VSA.allRows()[0];
  if (!row) throw new Error('no timesheet line on this page');
  const act = document.getElementById(`tiers_${row}`);
  const original = act.value;

  // Codes starting with "I-" are internal activities (Absence, Formation...)
  // and carry no project list; "C-" codes are real clients.
  const clients = [...act.options]
    .map((o) => ({ label: o.text.trim(), code: o.value }))
    .filter((c) => c.code && c.code !== 'I-INTERNE');

  const catalog = [];
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
      catalog.push({ ...c, projects });
    } catch (err) {
      catalog.push({ ...c, projects: [], error: String(err.message || err) });
    }
  }

  act.value = original;
  if (typeof act.onchange === 'function') act.onchange();
  return catalog;
}

globalThis.VsaInject = { injectEntries, fetchCatalog, writeDay, groupByLine };
