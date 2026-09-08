// Entry point: installs the widen behaviour and answers requests from the
// options page. Nothing here submits the timesheet; Save stays manual.
//
// The options page re-injects these files when a tab predates an extension
// reload, so this guard keeps a second run from installing duplicate listeners.
if (!globalThis.__vsaExtLoaded) {
  globalThis.__vsaExtLoaded = true;

VsaWiden.installWiden();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ ok: true, rows: VSA.allRows().length });
    return false;
  }

  if (msg?.type === 'inject') {
    const post = (m) => chrome.runtime.sendMessage(m).catch(() => {});
    VsaInject.injectEntries(msg.entries, (p) => post({ type: 'inject-progress', ...p }))
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // async
  }

  if (msg?.type === 'catalog') {
    const post = (m) => chrome.runtime.sendMessage(m).catch(() => {});
    VsaInject.fetchCatalog(
      (p) => post({ type: 'catalog-progress', ...p }),
      // Partial results are pushed as they arrive so the options page can save
      // each step; a sync interrupted halfway still keeps what it found.
      (catalog) => post({ type: 'catalog-partial', catalog })
    )
      .then((catalog) => sendResponse({ ok: true, catalog }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // async
  }

  return false;
});

}
