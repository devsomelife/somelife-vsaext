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

// The project select is replaced/refilled after the client changes. Its
// placeholder ("Choose a mission / project", value "none") is present even when
// empty, so a real project option is what we wait for -- not option count, and
// not visibility, since the element can be display:none while correctly filled.
// A fingerprint of the option values currently in the select, used to tell a
// freshly loaded list apart from the previous client's list.
function projectsFingerprint(row) {
  const el = document.querySelector(VSA.projectSelectFor(row));
  return el ? [...el.options].map((o) => o.value).join('|') : '';
}

// Waits for VSA to actually REPLACE the project list. Waiting only for "some
// options exist" reads the previous client's list, which is still in the DOM
// for the first moments after the client changes -- that silently attributes
// one client's projects to another.
//
// `before` is the fingerprint captured immediately before the client changed.
async function waitForProjects(row, before, timeout = LIST_TIMEOUT_MS) {
  const started = Date.now();
  let seenChange = false;

  while (Date.now() - started < timeout) {
    const now = projectsFingerprint(row);
    if (now !== before) {
      seenChange = true;
      const el = document.querySelector(VSA.projectSelectFor(row));
      // The list is rebuilt in steps, so settle briefly and re-check before
      // trusting it. A client with genuinely no projects also lands here.
      await sleep(SETTLE_MS);
      if (projectsFingerprint(row) === now) return el;
      continue;
    }
    await sleep(120);
  }

  // Timed out. Returning the element unchanged would hand back the previous
  // client's projects, so signal "nothing loaded" instead.
  return seenChange ? document.querySelector(VSA.projectSelectFor(row)) : null;
}

// Projects are grouped under headers such as "Fixed-price contracts" and
// "Time-based contracts". `select.options` flattens optgroups, so the headers
// need no handling; only the "none" placeholder is dropped.
function readProjects(sel) {
  if (!sel) return [];
  return [...sel.options]
    .filter((o) => o.value && o.value !== 'none' && !o.disabled)
    .map((o) => ({
      label: o.text.trim(),
      code: o.value,
      group: o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement.label : undefined,
    }))
    .filter((p) => p.label);
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
    // Captured before the change, so it describes the list being replaced.
    const before = projectsFingerprint(row);
    act.value = opt.value;
    if (typeof act.onchange === 'function') act.onchange();
    else fire(act, 'change');
    const sel = await waitForProjects(row, before);
    if (!sel) throw new Error(`no projects loaded for "${label}"`);
  }
  return act;
}

// `project` is the stored label; `projectCode` is the option value the catalog
// recorded. Matching on the code first survives label drift ("... >>> 10/15"
// counts up as days are booked), with the label kept as a fallback.
async function chooseProject(row, projectLabel, projectCode) {
  // chooseActivity already waited for the correct list, so read it directly.
  const sel = document.querySelector(VSA.projectSelectFor(row));
  if (!sel || readProjects(sel).length === 0) {
    throw new Error(`row ${row}: project list did not load`);
  }
  const opts = [...sel.options];
  const opt =
    (projectCode && opts.find((o) => o.value === projectCode)) ||
    opts.find((o) => o.text.trim() === String(projectLabel).trim()) ||
    opts.find((o) => o.text.trim().startsWith(String(projectLabel).trim()));
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
    if (!byKey.has(key)) {
      byKey.set(key, {
        client: e.client,
        project: e.project,
        projectCode: e.projectCode,
        days: [],
      });
    }
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
// Injection runs in two distinct passes.
//
// Phase 1 (structure) creates one timesheet line per client/project pair and
// selects both dropdowns. This is the slow, asynchronous part: every client
// change round-trips to VSA to load its project list.
//
// Phase 2 (time) writes the day cells. It is purely local and instant.
//
// Keeping them apart means a failure while loading a project list cannot leave
// days written against a half-configured line: phase 2 only ever runs over
// lines phase 1 confirmed, and days for a failed line are never written.
async function prepareLines(entries, onProgress) {
  const groups = groupByLine(entries);
  const prepared = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (onProgress) {
      onProgress({ phase: 'structure', index: i + 1, total: groups.length, client: g.client });
    }
    let row = VSA.allRows()[i];
    try {
      if (!row) row = await addLine();
      await chooseActivity(row, g.client);
      await chooseProject(row, g.project, g.projectCode);
      prepared.push({ ...g, row, ok: true });
    } catch (err) {
      prepared.push({ ...g, row, ok: false, error: String(err.message || err) });
    }
  }
  return prepared;
}

function writeTimes(prepared, onProgress) {
  const report = [];

  for (let i = 0; i < prepared.length; i++) {
    const g = prepared[i];
    if (!g.ok) {
      // Never write days against a line whose client/project is not set.
      report.push({
        client: g.client,
        project: g.project,
        row: g.row,
        ok: false,
        count: 0,
        error: g.error,
      });
      continue;
    }
    if (onProgress) {
      onProgress({ phase: 'time', index: i + 1, total: prepared.length, client: g.client });
    }
    try {
      for (const e of g.days) {
        writeDay(g.row, dayNumber(e.date), e.days);
      }
      report.push({
        client: g.client,
        project: g.project,
        row: g.row,
        ok: true,
        count: g.days.length,
      });
    } catch (err) {
      report.push({
        client: g.client,
        project: g.project,
        row: g.row,
        ok: false,
        count: 0,
        error: String(err.message || err),
      });
    }
  }
  return report;
}

async function injectEntries(entries, onProgress) {
  const prepared = await prepareLines(entries, onProgress);
  const report = writeTimes(prepared, onProgress);
  return {
    report,
    prepared: prepared.filter((g) => g.ok).length,
    total: prepared.length,
  };
}

// Catalog sync: walk every client in the activity dropdown and collect the
// project list VSA returns for it. Uses the first line as a scratch row and
// restores its original value afterwards.
async function fetchCatalog(onProgress, onPartial) {
  const row = VSA.allRows()[0];
  if (!row) throw new Error('no timesheet line on this page');
  const act = document.getElementById(`tiers_${row}`);
  const original = act.value;

  // Only the options under <optgroup label="Customers"> are synced. The other
  // options are internal activities (Absence, Formation...) and are left out
  // of the catalog entirely.
  const clients = [...act.querySelectorAll('optgroup')]
    .filter((g) => g.label.trim() === VSA.customersGroupLabel)
    .flatMap((g) => [...g.querySelectorAll('option')])
    .map((o) => ({ label: o.text.trim(), code: o.value }))
    .filter((c) => c.code);

  const catalog = [];

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    if (onProgress) onProgress({ index: i + 1, total: clients.length, client: c.label });
    try {
      const before = projectsFingerprint(row);
      act.value = c.code;
      if (typeof act.onchange === 'function') act.onchange();
      else fire(act, 'change');
      const sel = await waitForProjects(row, before);
      catalog.push({
        ...c,
        projects: readProjects(sel),
        ...(sel ? {} : { error: 'project list did not load' }),
      });
    } catch (err) {
      catalog.push({ ...c, projects: [], error: String(err.message || err) });
    }
    // Hand back what we have after every client, so closing the options page
    // mid-sync keeps the work already done instead of discarding all of it.
    if (onPartial) onPartial(sortCatalog(catalog));
  }

  act.value = original;
  if (typeof act.onchange === 'function') act.onchange();
  return sortCatalog(catalog);
}

function sortCatalog(catalog) {
  return [...catalog].sort((a, b) => a.label.localeCompare(b.label));
}

globalThis.VsaInject = {
  injectEntries,
  prepareLines,
  writeTimes,
  fetchCatalog,
  writeDay,
  groupByLine,
};
