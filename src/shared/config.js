// The timesheet URL is user configuration, not a constant: different companies
// run VSA on their own host, and the path can differ too.
//
// Nothing in this repository hardcodes a host. The user sets their timesheet
// URL on the options page, grants permission for that host, and the content
// script is registered against it at runtime.

const KEY = 'timesheetUrl';
const LANG_KEY = 'language';

// "auto" reads the language from the VSA page itself, which is right unless the
// page reports something unexpected.
export const LANGUAGES = ['auto', 'fr', 'en'];

export async function getLanguage() {
  const bag = await chrome.storage.local.get(LANG_KEY);
  return LANGUAGES.includes(bag[LANG_KEY]) ? bag[LANG_KEY] : 'auto';
}

export async function setLanguage(lang) {
  if (!LANGUAGES.includes(lang)) throw new Error(`unknown language "${lang}"`);
  await chrome.storage.local.set({ [LANG_KEY]: lang });
}

export async function getTimesheetUrl() {
  const bag = await chrome.storage.local.get(KEY);
  return bag[KEY] || '';
}

export async function setTimesheetUrl(url) {
  await chrome.storage.local.set({ [KEY]: normalizeUrl(url) });
}

// Accepts what a user would paste from the address bar and trims the query and
// fragment, which vary per visit and must not narrow the match pattern.
export function normalizeUrl(input) {
  const url = new URL(String(input).trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('URL must be http or https');
  }
  return `${url.origin}${url.pathname}`;
}

// A Chrome match pattern covering the timesheet page and anything under it.
// Chrome requires the path to start with "/", and a trailing "*" so query
// strings still match.
export function matchPatternFor(url) {
  const { origin, pathname } = new URL(normalizeUrl(url));
  const path = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return `${origin}${path}*`;
}

// The origin alone, which is what a host permission is granted against.
export function originPatternFor(url) {
  return `${new URL(normalizeUrl(url)).origin}/*`;
}

export function describeUrlError(err) {
  return err instanceof TypeError
    ? 'That does not look like a URL. Paste the full address, including https://'
    : err.message;
}

// ---- Team CRA workbook -------------------------------------------------------

const CRA_SHEET_KEY = 'craSheetName';
const CRA_URL_KEY = 'craUrl';

// Name of the user's tab in the team CRA workbook. Optional: when set, the
// workbook-side import refuses a block pasted into someone else's tab.
export async function getCraSheetName() {
  const bag = await chrome.storage.local.get(CRA_SHEET_KEY);
  return bag[CRA_SHEET_KEY] || '';
}

export async function setCraSheetName(name) {
  await chrome.storage.local.set({ [CRA_SHEET_KEY]: String(name || '').trim() });
}

// The workbook link is kept whole, query string included: SharePoint sharing
// links carry the file reference there, unlike the timesheet URL whose query
// varies per visit. Empty clears it.
export function normalizeCraUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('URL must be http or https');
  }
  return url.href;
}

export async function getCraUrl() {
  const bag = await chrome.storage.local.get(CRA_URL_KEY);
  return bag[CRA_URL_KEY] || '';
}

export async function setCraUrl(url) {
  await chrome.storage.local.set({ [CRA_URL_KEY]: normalizeCraUrl(url) });
}
