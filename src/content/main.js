// Entry point: installs the widen behaviour and answers requests from the
// options page. Nothing here submits the timesheet; Save stays manual.

VsaWiden.installWiden();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ ok: true, rows: VSA.allRows().length });
    return false;
  }

  if (msg?.type === 'inject') {
    VsaInject.injectEntries(msg.entries)
      .then((report) => sendResponse({ ok: true, report }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // async
  }

  if (msg?.type === 'catalog') {
    VsaInject.fetchCatalog((p) => chrome.runtime.sendMessage({ type: 'catalog-progress', ...p }).catch(() => {}))
      .then((catalog) => sendResponse({ ok: true, catalog }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // async
  }

  return false;
});
