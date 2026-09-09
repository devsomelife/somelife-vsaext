// Registers the content script against the user's configured timesheet URL.
//
// The manifest declares no host, so the script is registered at runtime once
// the user has set their URL and granted permission for that host. This keeps
// the extension free of any company-specific address.

import { getTimesheetUrl, matchPatternFor } from './shared/config.js';

const SCRIPT_ID = 'vsa-timesheet';

export const CONTENT_FILES = [
  'src/content/selectors.js',
  'src/content/widen.js',
  'src/content/inject.js',
  'src/content/main.js',
];

const CSS_FILES = ['src/content/widen.css'];

// Re-registers the content script for the configured URL. Safe to call
// repeatedly: any previous registration is replaced.
export async function syncRegistration() {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }

  const url = await getTimesheetUrl();
  if (!url) return { registered: false, reason: 'no URL configured' };

  const matches = [matchPatternFor(url)];

  // Registration fails without host permission, which the user grants from the
  // options page.
  const granted = await chrome.permissions.contains({ origins: matches });
  if (!granted) return { registered: false, reason: 'permission not granted' };

  await chrome.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      matches,
      js: CONTENT_FILES,
      css: CSS_FILES,
      runAt: 'document_idle',
    },
  ]);
  return { registered: true, matches };
}

chrome.runtime.onInstalled.addListener(() => syncRegistration());
chrome.runtime.onStartup.addListener(() => syncRegistration());

// The options page asks for a re-registration after the URL or permission
// changes.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'sync-registration') {
    syncRegistration()
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  return false;
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
