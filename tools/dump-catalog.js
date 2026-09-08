// Paste into the DevTools console on the VSA timesheet page.
// Walks every client in the activity dropdown, reads the project select that
// refreshes underneath it, and copies the whole catalog to the clipboard.
//
// Restores the original selection when done. Saves nothing in VSA.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const act = document.querySelector('select.selectTimesheetLine[id^="tiers_"]');
  if (!act) return console.error('No timesheet line found. Is the grid loaded?');

  const row = act.id.replace(/^tiers_/, '');
  const projSel = () => document.getElementById(`complete_line_${row}`);
  const original = act.value;

  const all = [...act.options]
    .map((o) => ({ label: o.text.trim(), code: o.value }))
    .filter((c) => c.code && c.code !== 'I-INTERNE');

  const clients = all.filter((c) => c.code.startsWith('C-'));
  const internal = all.filter((c) => !c.code.startsWith('C-'))
    .map((c) => ({ ...c, internal: true, projects: [] }));

  console.log(`Reading ${clients.length} clients...`);
  const out = [...internal];

  for (const [i, c] of clients.entries()) {
    act.value = c.code;
    if (typeof act.onchange === 'function') act.onchange();
    else act.dispatchEvent(new Event('change', { bubbles: true }));

    // Wait until the project select is both populated and visible.
    const started = Date.now();
    let sel = null;
    while (Date.now() - started < 15000) {
      const el = projSel();
      if (el && el.options.length > 0 && el.offsetParent !== null) { sel = el; break; }
      await sleep(150);
    }

    const projects = sel
      ? [...sel.options].map((o) => ({ label: o.text.trim(), code: o.value })).filter((p) => p.code)
      : [];
    out.push({ ...c, internal: false, projects });
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
