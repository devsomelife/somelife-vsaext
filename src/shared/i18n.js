// Interface strings, from _locales/<locale>/messages.json. The browser picks
// the locale from its own UI language and falls back to default_locale (en), so
// a French browser gets French and everything else English.
//
// chrome.i18n has no plurals: a counted message has `_one` and `_other` keys,
// picked with the plural rules of the locale actually served, which the
// `locale` message names.

// A missing key shows as the key, rather than as a blank button.
export function t(key, ...subs) {
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
}

let cached;
function rules() {
  if (!cached) {
    const locale = t('locale');
    cached = {
      locale,
      plural: new Intl.PluralRules(locale),
      number: new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false }),
    };
  }
  return cached;
}

// French counts 0 as singular; large numbers are "many" there, worded as other.
export function tn(key, count, ...subs) {
  const form = rules().plural.select(count) === 'one' ? 'one' : 'other';
  return t(`${key}_${form}`, formatNumber(count), ...subs);
}

// Day fractions with the locale's decimal separator: 0.5 in English, 0,5 in French.
export function formatNumber(n) {
  return rules().number.format(n);
}

export function uiLocale() {
  return rules().locale;
}

// Static labels are named in the markup and filled at load: data-i18n sets the
// text, data-i18n-<attribute> sets that attribute.
const ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

export function localizePage(root = document) {
  document.documentElement.lang = uiLocale();
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const attr of ATTRIBUTES) {
    for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    }
  }
}
