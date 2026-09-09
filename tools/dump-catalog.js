// Paste into the DevTools console on the VSA timesheet page.
// Walks every client in the activity dropdown, reads the project select that
// refreshes underneath it, and copies the whole catalog to the clipboard.
//
// Restores the original selection when done. Saves nothing in VSA.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fingerprint = (el) => (el ? [...el.options].map((o) => o.value).join('|') : '');
  // Headers are optgroups (flattened by .options); "none" is the placeholder.
  const readProjects = (sel) =>
    [...sel.options]
      .filter((o) => o.value && o.value !== 'none' && !o.disabled)
      .map((o) => ({
        label: o.text.trim(),
        code: o.value,
        group: o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement.label : undefined,
      }));
  const act = document.querySelector('select.selectTimesheetLine[id^="tiers_"]');
  if (!act) return console.error('No timesheet line found. Is the grid loaded?');

  const row = act.id.replace(/^tiers_/, '');
  // The project list is select.select_order, whose id is random -- find it by
  // name. (#complete_line_<row> exists but is never populated.)
  const projSel = () =>
    document.querySelector(`select.select_order[name="line[${row}][order_id]"]`);
  const original = act.value;

  // Only clients are collected; internal activities are ignored. Clients carry
  // a "C-" code in every locale, unlike the optgroup label ("Customers" in
  // English, "Clients" in French).
  const isClient = (o) =>
    o.value.startsWith('C-') ||
    (o.parentElement?.tagName === 'OPTGROUP' &&
      ['Customers', 'Clients'].includes(o.parentElement.label.trim()));

  const clients = [...act.options]
    .filter((o) => o.value && isClient(o))
    .map((o) => ({ label: o.text.trim(), code: o.value }));

  console.log(`Reading ${clients.length} clients...`);
  const out = [];

  for (const [i, c] of clients.entries()) {
    const before = fingerprint(projSel());
    act.value = c.code;
    if (typeof act.onchange === 'function') act.onchange();
    else act.dispatchEvent(new Event('change', { bubbles: true }));

    // Wait for the list to actually change: the previous client's projects stay
    // in the DOM briefly, and reading those would mis-attribute them.
    const started = Date.now();
    let sel = null;
    while (Date.now() - started < 15000) {
      const el = projSel();
      if (el && fingerprint(el) !== before) { sel = el; break; }
      await sleep(150);
    }

    const projects = sel ? readProjects(sel) : [];
    out.push({ ...c, projects });
    console.log(`${i + 1}/${clients.length} ${c.label}: ${projects.length} projects${sel ? '' : ' (TIMED OUT)'}`);
  }

  act.value = original;
  if (typeof act.onchange === 'function') act.onchange();

  const json = JSON.stringify({ catalog: out }, null, 2);
  console.log(json);
  try {
    await navigator.clipboard.writeText(json);
    console.log('Copied to clipboard.');
  } catch {
    window.__catalog = json;
    console.log('Clipboard blocked. Run: copy(window.__catalog)');
  }
})();
